import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Shield, UserPlus } from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import { popIcon, revealCards, revealText } from '../utils/animations';

export const AccessAuditPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    currentUser,
    accessState,
    createAdminUser,
    updateAdminUser,
    issueResetToken,
    updateRolePermissions,
    showToast,
  } = useAdmin();

  const activeTab = (route.sub as 'users' | 'permissions' | 'logins' | 'audit') || 'users';
  const canManageAccess = can('access.manage');
  const canReadAudit = can('audit.read') || can('access.read');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('Operations Staff');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [issuedReset, setIssuedReset] = useState<{
    email: string;
    token: string;
    expiresInMinutes: number;
  } | null>(null);

  useEffect(() => {
    if (!roleId && accessState.roles.length > 0) {
      const editor = accessState.roles.find((r) => r.name === 'Editor');
      setRoleId(editor?.id || accessState.roles[0].id);
    }
  }, [accessState.roles, roleId]);

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      showToast('Provide full name, valid email, and password (min 8 chars)', 'bad');
      return;
    }
    setCreating(true);
    try {
      await createAdminUser({
        fullName: fullName.trim(),
        email: email.trim(),
        designation: designation.trim(),
        roleId,
        password,
      });
      setFullName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create user', 'bad');
    } finally {
      setCreating(false);
    }
  };

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
          Manage internal staff accounts, fine-grained RBAC permissions, sign-in activity, and immutable audit logs.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'users',
            label: 'Users & Roles',
            href: '#/access/users',
            count: accessState.users.length,
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
            count: accessState.auditLogs.length,
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

          {canManageAccess && (
            <form
              onSubmit={handleCreateUser}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-bold flex items-center gap-2">
                  <UserPlus size={16} className="text-[var(--accent)]" />
                  <span>Create Internal Admin Account</span>
                </h2>
                <button
                  type="submit"
                  disabled={creating}
                  onClick={(e) => popIcon(e.currentTarget)}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] disabled:opacity-45 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Assigned Role
                  </label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  >
                    {accessState.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Initial Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
              </div>
            </form>
          )}

          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    <th className="py-2.5 pr-3">Staff Member</th>
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
                          {canManageAccess && !isSelf ? (
                            <select
                              value={u.role_id}
                              onChange={(e) =>
                                void updateAdminUser(u.id, { roleId: e.target.value })
                              }
                              className="admin-input px-2.5 py-1 text-[12.5px]"
                            >
                              {accessState.roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold">{u.role_name}</span>
                          )}
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
          </section>
        </div>
      )}

      {activeTab === 'permissions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accessState.roles.map((role) => {
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
          })}
        </div>
      )}

      {activeTab === 'logins' && (
        <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
          {!canReadAudit ? (
            <p className="text-[13.5px] text-[var(--muted)]">
              Audit permission required to inspect login history.
            </p>
          ) : accessState.loginLogs.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No login events recorded yet.</p>
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
        <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
          {!canReadAudit ? (
            <p className="text-[13.5px] text-[var(--muted)]">
              Audit permission required to view administrative trail.
            </p>
          ) : accessState.auditLogs.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No administrative actions logged yet.</p>
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
      )}
    </div>
  );
};
