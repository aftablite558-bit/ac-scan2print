import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, KeyRound, Lock, RefreshCw, Search, Shield, ShieldCheck } from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import { popIcon, revealCards, revealText } from '../utils/animations';
import {
  buildAuditEventsCsv,
  formatDateTime,
  triggerTextDownload,
  type AdminCleanupLog,
  type AdminPrintEvent,
} from '../utils/printManagement';

interface PrintAuditSnapshotResponse {
  recentEvents?: AdminPrintEvent[];
  recentPilotEvents?: AdminPrintEvent[];
  cleanupLogs?: AdminCleanupLog[];
}

export const AccessAuditPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    currentUser,
    integrations,
    accessState,
    updateAdminUser,
    issueResetToken,
    updateRolePermissions,
    invokeAdminEdgeFunction,
    showToast,
  } = useAdmin();

  const activeTab = (route.sub as 'users' | 'permissions' | 'logins' | 'audit') || 'users';
  const canManageAccess = can('access.manage');
  const canReadAudit = can('audit.read') || can('access.read');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [issuedReset, setIssuedReset] = useState<{
    email: string;
    token: string;
    expiresInMinutes: number;
  } | null>(null);
  const [printEvents, setPrintEvents] = useState<AdminPrintEvent[]>([]);
  const [cleanupLogs, setCleanupLogs] = useState<AdminCleanupLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditQuery, setAuditQuery] = useState('');

  const loadPrintAudit = useCallback(async () => {
    if (!integrations.supabaseConfigured || !canReadAudit) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await invokeAdminEdgeFunction<PrintAuditSnapshotResponse>('admin-print-jobs', {
        action: 'list',
        page: 1,
        pageSize: 15,
      });
      const events = Array.isArray(res.recentEvents)
        ? res.recentEvents
        : Array.isArray(res.recentPilotEvents)
          ? res.recentPilotEvents
          : [];
      setPrintEvents(events);
      setCleanupLogs(Array.isArray(res.cleanupLogs) ? res.cleanupLogs : []);
    } catch (err) {
      setAuditError(
        err instanceof Error ? err.message : 'Unable to load Supabase Scan2Print audit stream.'
      );
    } finally {
      setAuditLoading(false);
    }
  }, [canReadAudit, integrations.supabaseConfigured, invokeAdminEdgeFunction]);

  useEffect(() => {
    if (activeTab === 'audit') {
      void loadPrintAudit();
    }
  }, [activeTab, loadPrintAudit]);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.04,
      stagger: 0.05,
    });
  }, [activeTab]);

  const handleTogglePermission = async (
    targetRoleId: string,
    currentCodes: string[],
    code: string
  ) => {
    const next = currentCodes.includes(code)
      ? currentCodes.filter((c) => c !== code)
      : [...currentCodes, code];
    try {
      await updateRolePermissions(targetRoleId, next);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update permissions', 'bad');
    }
  };

  const handleIssueToken = async (userId: string, userEmail: string) => {
    try {
      const res = await issueResetToken(userId);
      setIssuedReset({ email: userEmail, ...res });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to issue reset token', 'bad');
    }
  };

  const filteredPrintEvents = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    if (!q) return printEvents;
    return printEvents.filter(
      (ev) =>
        ev.event_type.toLowerCase().includes(q) ||
        ev.actor_type.toLowerCase().includes(q) ||
        (ev.actor_id ?? '').toLowerCase().includes(q) ||
        (ev.job_id ?? '').toLowerCase().includes(q) ||
        JSON.stringify(ev.metadata ?? {}).toLowerCase().includes(q)
    );
  }, [auditQuery, printEvents]);

  const displayedUsersCount =
    accessState.users.length > 0 ? accessState.users.length : currentUser ? 1 : 0;

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Access Control & Audit
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Single Super Admin governance, RBAC visibility, sign-in activity, and immutable Scan2Print audit logs.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'users',
            label: 'Admin Identity',
            href: '#/access/users',
            count: displayedUsersCount,
          },
          {
            id: 'permissions',
            label: 'Role Permissions',
            href: '#/access/permissions',
            count: accessState.roles.length,
          },
          {
            id: 'logins',
            label: 'Login Activity',
            href: '#/access/logins',
            count: accessState.loginLogs.length,
          },
          {
            id: 'audit',
            label: 'Audit Trail',
            href: '#/access/audit',
            count: printEvents.length + accessState.auditLogs.length,
          },
        ]}
      />

      {activeTab === 'users' && (
        <div className="space-y-5">
          {issuedReset && (
            <div className="anim-card rounded-[18px] bg-[var(--accent-soft)] border border-[var(--accent)] p-4 text-[13px] space-y-1">
              <div className="font-bold">
                One-time password reset token issued for {issuedReset.email}
              </div>
              <div className="font-mono text-[12.5px] select-all break-all">
                {issuedReset.token}
              </div>
              <div className="text-[11.5px] text-[var(--muted)]">
                Expires in {issuedReset.expiresInMinutes} minutes. Share securely with the staff member.
              </div>
            </div>
          )}

          {/* Single Super Admin Policy Governance Card */}
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold flex items-center gap-2">
                  <Lock size={16} className="text-[var(--good)]" />
                  <span>Single Super Admin Security Policy Active</span>
                </h2>
                <p className="text-[13px] text-[var(--muted)] max-w-[680px]">
                  AC Scan2Print enforces a strict single-owner administrator lock in{' '}
                  <code className="font-mono text-[12px]">print_admin_accounts</code> using
                  Firebase Auth RS256 tokens verified server-side. Sub-admin self-registration and
                  additional admin creation are permanently disabled to protect counter financial
                  accountability.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-[var(--good-soft)] text-[var(--good)] text-[12px] font-semibold inline-flex items-center gap-1.5">
                <ShieldCheck size={14} />
                <span>Singleton Guard Enforced</span>
              </span>
            </div>

            {currentUser && (
              <div className="rounded-[16px] bg-[var(--card-2)] border border-[var(--line)] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
                <div>
                  <div className="text-[11.5px] text-[var(--muted)] font-semibold uppercase tracking-[0.05em]">
                    Verified Operator
                  </div>
                  <div className="font-bold mt-0.5">{currentUser.fullName}</div>
                  <div className="text-[12px] text-[var(--muted)]">{currentUser.email}</div>
                </div>
                <div>
                  <div className="text-[11.5px] text-[var(--muted)] font-semibold uppercase tracking-[0.05em]">
                    Role & Permissions
                  </div>
                  <div className="font-bold mt-0.5">{currentUser.roleName}</div>
                  <div className="text-[12px] text-[var(--muted)] tabular-nums">
                    {currentUser.permissions.length} permission grants active
                  </div>
                </div>
                <div>
                  <div className="text-[11.5px] text-[var(--muted)] font-semibold uppercase tracking-[0.05em]">
                    Identity Provider
                  </div>
                  <div className="font-bold mt-0.5">
                    {integrations.firebaseConfigured ? 'Firebase Auth RS256' : 'Local Session'}
                  </div>
                  <div className="text-[12px] text-[var(--muted)]">
                    {integrations.supabaseConfigured
                      ? 'Supabase Backend Verified'
                      : 'Supabase Env Required'}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
            {accessState.users.length === 0 ? (
              <div className="text-[13px] text-[var(--muted)] space-y-1">
                <div className="font-semibold text-[var(--ink)]">
                  Cloud-Only Admin Mode Active
                </div>
                <p>
                  Local Express staff table is inactive on Firebase Hosting; your single Super Admin
                  account above is authenticated directly against Supabase{' '}
                  <code className="font-mono text-[12px]">print_admin_accounts</code>.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                      <th className="py-2.5 pr-3">Account</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Last Login</th>
                      <th className="py-2.5 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {accessState.users.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      return (
                        <tr key={u.id}>
                          <td className="py-3 pr-3">
                            <div className="font-semibold">{u.full_name}</div>
                            <div className="text-[12px] text-[var(--muted)]">
                              {u.email} · {u.designation}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold">{u.role_name}</span>
                          </td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              disabled={!canManageAccess || isSelf}
                              onClick={() =>
                                void updateAdminUser(u.id, { isActive: !Boolean(u.is_active) })
                              }
                              className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold cursor-pointer disabled:opacity-60 ${
                                u.is_active
                                  ? 'bg-[var(--good-soft)] text-[var(--good)]'
                                  : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                              }`}
                            >
                              {u.is_active ? 'Active' : 'Suspended'}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-[var(--muted)] tabular-nums">
                            {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            {canManageAccess && (
                              <button
                                type="button"
                                onClick={() => void handleIssueToken(u.id, u.email)}
                                className="btn-ghost px-3 py-1 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <KeyRound size={12} />
                                <span>Reset Token</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accessState.roles.length === 0 ? (
            <section className="anim-card glass-pane rounded-[22px] p-5 md:col-span-2 text-[13px] text-[var(--muted)]">
              Super Admin holds all Scan2Print operational permissions via Firebase UID binding.
              Granular local role tables apply only when running the optional Express CMS server.
            </section>
          ) : (
            accessState.roles.map((role) => {
              const mapping = accessState.rolePermissions.find((rp) => rp.roleId === role.id);
              const assigned = mapping?.permissions || [];
              const lockedSuper = role.name === 'Super Admin';
              return (
                <section
                  key={role.id}
                  className="anim-card glass-pane rounded-[22px] p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-[16px] font-bold flex items-center gap-2">
                        <Shield size={15} className="text-[var(--accent)]" />
                        <span>{role.name}</span>
                      </h2>
                      <p className="text-[12px] text-[var(--muted)] mt-0.5">{role.description}</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--card-2)] text-[11px] font-semibold tabular-nums">
                      {assigned.length} perms
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scroll pr-1">
                    {accessState.permissions.map((perm) => {
                      const checked = assigned.includes(perm.code);
                      return (
                        <label
                          key={perm.code}
                          className="flex items-start justify-between gap-3 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px] cursor-pointer"
                        >
                          <div>
                            <div className="font-semibold">{perm.code}</div>
                            <div className="text-[11.5px] text-[var(--muted)]">{perm.description}</div>
                          </div>
                          <input
                            type="checkbox"
                            disabled={!canManageAccess || lockedSuper}
                            checked={checked}
                            onChange={() => void handleTogglePermission(role.id, assigned, perm.code)}
                            className="mt-1 accent-[var(--accent)]"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'logins' && (
        <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
          {!canReadAudit ? (
            <p className="text-[13.5px] text-[var(--muted)]">
              Audit permission required to inspect login history.
            </p>
          ) : accessState.loginLogs.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">
              No local login events recorded. Production sign-ins are audited by Firebase Authentication.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    <th className="py-2.5 pr-3">Account</th>
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">IP Address</th>
                    <th className="py-2.5 pl-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {accessState.loginLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 pr-3 font-semibold">{log.email}</td>
                      <td className="py-2.5 px-3">{log.event_type}</td>
                      <td className="py-2.5 px-3 text-[var(--muted)]">
                        {log.ip_address || 'local'}
                      </td>
                      <td className="py-2.5 pl-3 text-[var(--muted)] tabular-nums">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-5">
          {/* Live Supabase Scan2Print Immutable Events */}
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-bold">Scan2Print Immutable Operational Audit</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Append-only server event ledger covering job reviews, UPI/Cash verifications, queue releases, agent heartbeats, and file purges.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={auditLoading}
                  onClick={(e) => {
                    popIcon(e.currentTarget);
                    void loadPrintAudit();
                  }}
                  className="btn-ghost px-3 py-1.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={auditLoading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  disabled={filteredPrintEvents.length === 0}
                  onClick={() => {
                    const csv = buildAuditEventsCsv(filteredPrintEvents);
                    triggerTextDownload(
                      `ac-scan2print-audit-${new Date().toISOString().slice(0, 10)}.csv`,
                      csv,
                      'text/csv;charset=utf-8'
                    );
                    showToast(`Exported ${filteredPrintEvents.length} audit event(s).`, 'good');
                  }}
                  className="btn-primary px-3.5 py-1.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                >
                  <Download size={13} />
                  <span>Export Audit CSV</span>
                </button>
              </div>
            </div>

            {canReadAudit && (
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  aria-label="Filter audit events"
                  value={auditQuery}
                  onChange={(e) => setAuditQuery(e.target.value)}
                  placeholder="Filter by event type, actor, job UUID, or metadata..."
                  className="admin-input w-full pl-9 pr-3 py-2 text-[13px]"
                />
              </div>
            )}

            {auditError && (
              <div className="rounded-[14px] p-3 bg-[var(--bad-soft)] text-[var(--bad)] text-[12.5px]">
                {auditError}
              </div>
            )}

            {!canReadAudit ? (
              <p className="text-[13.5px] text-[var(--muted)]">
                Audit permission required to view administrative trail.
              </p>
            ) : auditLoading && filteredPrintEvents.length === 0 ? (
              <p className="text-[13.5px] text-[var(--muted)]">
                Loading immutable Scan2Print audit stream...
              </p>
            ) : filteredPrintEvents.length === 0 ? (
              <p className="text-[13.5px] text-[var(--muted)]">
                No Scan2Print audit events recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto custom-scroll">
                <table className="w-full text-left text-[12.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.06em] text-[var(--muted)]">
                      <th className="py-2 pr-3">Event Type</th>
                      <th className="py-2 px-3">Actor</th>
                      <th className="py-2 px-3">Transition</th>
                      <th className="py-2 px-3">Job ID</th>
                      <th className="py-2 pl-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredPrintEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td className="py-2.5 pr-3 font-semibold">{ev.event_type}</td>
                        <td className="py-2.5 px-3">
                          <span className="capitalize font-medium">{ev.actor_type}</span>
                          {ev.actor_id ? (
                            <span className="text-[var(--muted)] font-mono text-[11px] ml-1.5">
                              {ev.actor_id.slice(0, 12)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--muted)]">
                          {ev.previous_status || ev.new_status
                            ? `${ev.previous_status ?? '—'} → ${ev.new_status ?? '—'}`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11.5px] text-[var(--muted)]">
                          {ev.job_id ? ev.job_id.slice(0, 13) : 'system'}
                        </td>
                        <td className="py-2.5 pl-3 text-[var(--muted)] tabular-nums whitespace-nowrap">
                          {formatDateTime(ev.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {cleanupLogs.length > 0 && (
              <div className="pt-3 border-t border-[var(--line)] text-[12px] text-[var(--muted)]">
                Latest retention cleanup: <strong>{cleanupLogs[0].run_mode}</strong> at{' '}
                {formatDateTime(cleanupLogs[0].executed_at)} ({cleanupLogs[0].jobs_expired} jobs
                expired, {cleanupLogs[0].storage_objects_removed} storage files purged).
              </div>
            )}
          </section>

          {/* Local CMS Administrative Audit Log */}
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-3">
            <h2 className="text-[16px] font-bold">CMS Workspace Activity Log</h2>
            {!canReadAudit ? (
              <p className="text-[13.5px] text-[var(--muted)]">
                Audit permission required to view administrative trail.
              </p>
            ) : accessState.auditLogs.length === 0 ? (
              <p className="text-[13.5px] text-[var(--muted)]">
                No CMS administrative actions logged in this environment.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                      <th className="py-2.5 pr-3">Actor</th>
                      <th className="py-2.5 px-3">Module</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 pl-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {accessState.auditLogs.map((act) => (
                      <tr key={act.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold">{act.actor_email}</div>
                          <div className="text-[11.5px] text-[var(--muted)]">{act.actor_role}</div>
                        </td>
                        <td className="py-2.5 px-3">{act.module}</td>
                        <td className="py-2.5 px-3">{act.action}</td>
                        <td className="py-2.5 pl-3 text-[var(--muted)] tabular-nums">
                          {new Date(act.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

