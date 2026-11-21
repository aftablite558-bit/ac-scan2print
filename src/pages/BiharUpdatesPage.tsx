import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Landmark,
  Languages,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { SegControl, TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import type { BiharCategory, GovtSource, GovtUpdateItem } from '../types/admin';
import { BIHAR_CATEGORIES } from '../utils/adminLogic';
import { popIcon, revealCards, revealText } from '../utils/animations';

export const BiharUpdatesPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    govtSources,
    govtUpdates,
    govtFetchLogs,
    integrations,
    createGovtSource,
    updateGovtSource,
    triggerGovtFetch,
    updateGovtUpdate,
    summarizeGovtHindi,
    sweepExpiredGovtUpdates,
    showToast,
  } = useAdmin();

  const activeTab = (route.sub as 'updates' | 'sources' | 'logs') || 'updates';
  const canRead = can('govt.read');
  const canFetch = can('govt.fetch') || can('govt.publish');
  const canPublish = can('govt.publish');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | GovtUpdateItem['status']>('all');
  const [fetchingAll, setFetchingAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add Source Form
  const [srcName, setSrcName] = useState('');
  const [srcDept, setSrcDept] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcType, setSrcType] = useState<GovtSource['source_type']>('website');
  const [srcCategory, setSrcCategory] = useState<BiharCategory>('Government Notifications');
  const [srcAutoPublish, setSrcAutoPublish] = useState(false);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.04,
      stagger: 0.05,
    });
  }, [activeTab, statusFilter]);

  const filteredUpdates = useMemo(() => {
    if (statusFilter === 'all') return govtUpdates;
    return govtUpdates.filter((u) => u.status === statusFilter);
  }, [govtUpdates, statusFilter]);

  const handleFetchAll = async () => {
    setFetchingAll(true);
    try {
      await triggerGovtFetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fetch failed', 'bad');
    } finally {
      setFetchingAll(false);
    }
  };

  const handleSummarize = async (id: string) => {
    setBusyId(id);
    try {
      await summarizeGovtHindi(id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Hindi summarization failed', 'bad');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!srcName.trim() || !srcUrl.trim()) return;
    try {
      await createGovtSource({
        name: srcName.trim(),
        department: srcDept.trim() || 'Government of Bihar',
        source_url: srcUrl.trim(),
        source_type: srcType,
        default_category: srcCategory,
        is_trusted: 1,
        auto_publish: srcAutoPublish ? 1 : 0,
        is_active: 1,
        fetch_interval_minutes: 180,
      });
      setSrcName('');
      setSrcDept('');
      setSrcUrl('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add source', 'bad');
    }
  };

  if (!canRead) {
    return (
      <div className="glass-pane rounded-[24px] p-8 text-center text-[14px] text-[var(--muted)]">
        Your role does not include Door 5 Bihar Updates access.
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            ref={h1Ref}
            className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
          >
            Door 5: Bihar Govt Updates
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-1">
            Live HTML/RSS ingestion from verified Bihar portals with SHA-256 deduplication and Gemini Hindi summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canPublish && (
            <button
              type="button"
              onClick={() => void sweepExpiredGovtUpdates()}
              className="btn-ghost px-3.5 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Clock size={14} />
              <span>Expire Sweep</span>
            </button>
          )}
          {canFetch && (
            <button
              type="button"
              disabled={fetchingAll}
              onClick={(e) => {
                popIcon(e.currentTarget);
                void handleFetchAll();
              }}
              className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
            >
              <RefreshCw size={14} className={fetchingAll ? 'animate-spin' : ''} />
              <span>{fetchingAll ? 'Fetching Portals...' : 'Fetch Active Sources'}</span>
            </button>
          )}
        </div>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'updates',
            label: 'Updates Queue',
            href: '#/bihar-updates/updates',
            count: govtUpdates.length,
          },
          {
            id: 'sources',
            label: 'Official Sources',
            href: '#/bihar-updates/sources',
            count: govtSources.length,
          },
          {
            id: 'logs',
            label: 'Fetch Logs',
            href: '#/bihar-updates/logs',
            count: govtFetchLogs.length,
          },
        ]}
      />

      {activeTab === 'updates' && (
        <div className="space-y-4">
          <SegControl
            ariaLabel="Filter Bihar updates"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: 'all', label: `All (${govtUpdates.length})` },
              { id: 'pending', label: 'Pending' },
              { id: 'published', label: 'Published' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'expired', label: 'Expired' },
            ]}
          />

          {filteredUpdates.length === 0 ? (
            <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
              No fetched notices match this filter. Click <strong>Fetch Active Sources</strong> to ingest live notices from configured Bihar portals.
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredUpdates.map((item) => (
                <article
                  key={item.id}
                  className="anim-card glass-pane rounded-[22px] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[11px] font-semibold">
                          {item.category}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            item.status === 'published'
                              ? 'bg-[var(--good-soft)] text-[var(--good)]'
                              : item.status === 'pending'
                                ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                                : 'bg-[var(--card-2)] text-[var(--muted)]'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <h3 className="text-[16px] font-bold leading-snug">{item.title}</h3>
                    </div>

                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost px-3 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1 shrink-0"
                    >
                      <span>Source</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>

                  {item.description && (
                    <p className="text-[13px] text-[var(--muted)] leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  {item.hindi_summary && (
                    <div className="rounded-[14px] bg-[var(--card-2)] border border-[var(--line)] p-3.5 text-[13px]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-text)] mb-1">
                        Hindi Summary (सरल हिन्दी सारांश)
                      </div>
                      <p className="leading-relaxed">{item.hindi_summary}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[var(--muted)] tabular-nums">
                      Captured {new Date(item.created_at).toLocaleString()}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {canPublish && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === item.id || !integrations.geminiConfigured}
                            title={
                              integrations.geminiConfigured
                                ? 'Generate Hindi summary via Gemini'
                                : 'Configure GEMINI_API_KEY on server to enable Hindi AI summary'
                            }
                            onClick={() => void handleSummarize(item.id)}
                            className="btn-ghost px-3 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                          >
                            <Languages size={13} />
                            <span>
                              {busyId === item.id ? 'Summarizing...' : 'Hindi Summary'}
                            </span>
                          </button>

                          {item.status !== 'published' && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateGovtUpdate(item.id, { status: 'published' })
                              }
                              className="btn-primary px-3.5 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 size={13} />
                              <span>Approve & Publish</span>
                            </button>
                          )}

                          {item.status !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateGovtUpdate(item.id, { status: 'rejected' })
                              }
                              className="btn-ghost px-3 py-1.5 rounded-full text-[12px] text-[var(--bad)] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={13} />
                              <span>Reject</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="space-y-5">
          {canPublish && (
            <form
              onSubmit={handleAddSource}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16px] font-bold flex items-center gap-2">
                  <Landmark size={16} className="text-[var(--accent)]" />
                  <span>Add Verified Bihar Government Portal</span>
                </h2>
                <button
                  type="submit"
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Source</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Portal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={srcName}
                    onChange={(e) => setSrcName(e.target.value)}
                    placeholder="e.g. BPSC Official Notices"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={srcDept}
                    onChange={(e) => setSrcDept(e.target.value)}
                    placeholder="Bihar Public Service Commission"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Source Type
                  </label>
                  <select
                    value={srcType}
                    onChange={(e) => setSrcType(e.target.value as GovtSource['source_type'])}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  >
                    <option value="website">Official Website</option>
                    <option value="rss">RSS / Atom Feed</option>
                    <option value="api">JSON API</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Official URL
                  </label>
                  <input
                    type="url"
                    required
                    value={srcUrl}
                    onChange={(e) => setSrcUrl(e.target.value)}
                    placeholder="https://..."
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Default Category
                  </label>
                  <select
                    value={srcCategory}
                    onChange={(e) => setSrcCategory(e.target.value as BiharCategory)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  >
                    {BIHAR_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={srcAutoPublish}
                  onChange={(e) => setSrcAutoPublish(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span>Auto-publish fetched notices from this trusted portal</span>
              </label>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {govtSources.map((src) => (
              <article
                key={src.id}
                className="anim-card glass-pane rounded-[22px] p-5 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                        {src.department} · {src.source_type.toUpperCase()}
                      </div>
                      <h3 className="text-[15.5px] font-bold mt-0.5">{src.name}</h3>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[11px] font-semibold">
                      <ShieldCheck size={12} className="text-[var(--good)]" />
                      {src.default_category}
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--muted)] truncate mt-1.5">
                    {src.source_url}
                  </div>
                  {src.last_error && (
                    <div className="mt-2 text-[12px] text-[var(--bad)]">{src.last_error}</div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canPublish}
                      onClick={() =>
                        void updateGovtSource(src.id, { is_active: src.is_active ? 0 : 1 })
                      }
                      className={`px-3 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer ${
                        src.is_active
                          ? 'bg-[var(--good-soft)] text-[var(--good)]'
                          : 'bg-[var(--card-2)] text-[var(--muted)]'
                      }`}
                    >
                      {src.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      disabled={!canPublish}
                      onClick={() =>
                        void updateGovtSource(src.id, { auto_publish: src.auto_publish ? 0 : 1 })
                      }
                      className={`px-3 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer ${
                        src.auto_publish
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'bg-[var(--card-2)] text-[var(--muted)]'
                      }`}
                    >
                      {src.auto_publish ? 'Auto-Publish' : 'Queue Review'}
                    </button>
                  </div>

                  {canFetch && (
                    <button
                      type="button"
                      onClick={() => void triggerGovtFetch(src.id)}
                      className="btn-ghost px-3 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>Fetch Now</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
          {govtFetchLogs.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No portal fetches executed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    <th className="py-2.5 pr-3">Portal</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Found / New / Dupes</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 pl-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {govtFetchLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3 pr-3 font-semibold">
                        <div>{log.source_name}</div>
                        {log.error_message && (
                          <div className="text-[11.5px] font-normal text-[var(--bad)]">
                            {log.error_message}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            log.status === 'success'
                              ? 'bg-[var(--good-soft)] text-[var(--good)]'
                              : log.status === 'partial'
                                ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                                : 'bg-[var(--bad-soft)] text-[var(--bad)]'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 tabular-nums">
                        {log.items_found} / {log.items_inserted} / {log.duplicates_skipped}
                      </td>
                      <td className="py-3 px-3 tabular-nums">{log.duration_ms} ms</td>
                      <td className="py-3 pl-3 text-[var(--muted)] tabular-nums">
                        {new Date(log.fetched_at).toLocaleString()}
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
