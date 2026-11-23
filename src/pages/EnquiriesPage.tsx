import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Inbox, MessageSquarePlus, Plus, Send } from 'lucide-react';
import { SegControl } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import type { EnquiryItem } from '../types/admin';
import { popIcon, revealCards, revealText } from '../utils/animations';

const STATUS_BADGE: Record<EnquiryItem['status'], string> = {
  new: 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
  in_progress: 'bg-[var(--warn-soft)] text-[var(--warn)]',
  resolved: 'bg-[var(--good-soft)] text-[var(--good)]',
  archived: 'bg-[var(--card-2)] text-[var(--muted)]',
};

export const EnquiriesPage: React.FC = () => {
  const { can, enquiries, createEnquiry, updateEnquiryStatus, addEnquiryNote, showToast } =
    useAdmin();
  const canRead = can('enquiries.read');
  const canWrite = can('enquiries.write');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [filter, setFilter] = useState<'all' | EnquiryItem['status']>('all');
  const [showCreate, setShowCreate] = useState(false);

  const [channel, setChannel] = useState<EnquiryItem['channel']>('walk_in');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [serviceInterest, setServiceInterest] = useState('Printing & Binding');
  const [message, setMessage] = useState('');
  const [busyCreate, setBusyCreate] = useState(false);

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.04,
      stagger: 0.05,
    });
  }, [filter]);

  const safeEnquiries = Array.isArray(enquiries) ? enquiries : [];

  const filtered = useMemo(() => {
    if (filter === 'all') return safeEnquiries;
    return safeEnquiries.filter((e) => e.status === filter);
  }, [safeEnquiries, filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !message.trim()) return;
    setBusyCreate(true);
    try {
      await createEnquiry({
        channel,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim(),
        service_interest: serviceInterest.trim(),
        message: message.trim(),
      });
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setMessage('');
      setShowCreate(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log enquiry', 'bad');
    } finally {
      setBusyCreate(false);
    }
  };

  const handleAddNote = async (id: string) => {
    const text = (noteDrafts[id] || '').trim();
    if (!text) return;
    try {
      await addEnquiryNote(id, text);
      setNoteDrafts((prev) => ({ ...prev, [id]: '' }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add note', 'bad');
    }
  };

  if (!canRead) {
    return (
      <div className="glass-pane rounded-[24px] p-8 text-center text-[14px] text-[var(--muted)]">
        Your role does not include permission to read customer enquiries.
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
            Customer Enquiries
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-1">
            Track contact form submissions, WhatsApp leads, and walk-in requests with internal notes.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={(e) => {
              popIcon(e.currentTarget);
              setShowCreate((s) => !s);
            }}
            className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus size={14} />
            <span>{showCreate ? 'Close Form' : 'Log Enquiry'}</span>
          </button>
        )}
      </div>

      <SegControl
        ariaLabel="Filter enquiries by status"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: `All (${safeEnquiries.length})` },
          { id: 'new', label: 'New' },
          { id: 'in_progress', label: 'In Progress' },
          { id: 'resolved', label: 'Resolved' },
          { id: 'archived', label: 'Archived' },
        ]}
      />

      {showCreate && canWrite && (
        <form
          onSubmit={handleCreate}
          className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4 max-w-[900px]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold flex items-center gap-2">
              <Inbox size={16} className="text-[var(--accent)]" />
              <span>Log New Customer Enquiry</span>
            </h2>
            <button
              type="submit"
              disabled={busyCreate}
              className="btn-primary px-4 py-2 rounded-full text-[13px] cursor-pointer disabled:opacity-45"
            >
              {busyCreate ? 'Saving...' : 'Save Enquiry'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as EnquiryItem['channel'])}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              >
                <option value="walk_in">Walk-In</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="contact_form">Contact Form</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Customer Name
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Email (optional)
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Service Interest
              </label>
              <input
                type="text"
                value={serviceInterest}
                onChange={(e) => setServiceInterest(e.target.value)}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                Message / Requirement
              </label>
              <textarea
                rows={2}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="admin-input w-full px-3.5 py-2 text-[13.5px]"
              />
            </div>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
          No enquiries match the selected filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <article key={item.id} className="anim-card glass-pane rounded-[22px] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-bold">{item.customer_name}</h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        STATUS_BADGE[item.status]
                      }`}
                    >
                      {item.status.replace('_', ' ')}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[11px] font-medium text-[var(--muted)]">
                      {item.channel.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-[var(--muted)] mt-1">
                    {item.service_interest}
                    {item.customer_phone ? ` · ${item.customer_phone}` : ''}
                    {item.customer_email ? ` · ${item.customer_email}` : ''}
                  </div>
                </div>

                {canWrite && (
                  <select
                    aria-label={`Change status for ${item.customer_name}`}
                    value={item.status}
                    onChange={(e) =>
                      void updateEnquiryStatus(item.id, e.target.value as EnquiryItem['status'])
                    }
                    className="admin-input px-3 py-1.5 text-[12.5px] font-semibold"
                  >
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </select>
                )}
              </div>

              <p className="text-[13.5px] leading-relaxed bg-[var(--card-2)] rounded-[14px] p-3.5 border border-[var(--line)]">
                {item.message}
              </p>

              {/* Timestamped Staff Notes */}
              <div className="space-y-2.5">
                {Array.isArray(item.notes) && item.notes.length > 0 && (
                  <div className="space-y-2 pl-3 border-l-2 border-[var(--line-2)]">
                    {item.notes.map((n) => (
                      <div key={n.id} className="text-[12.5px]">
                        <span className="font-semibold">{n.author_name}</span>{' '}
                        <span className="text-[var(--muted)] text-[11px]">
                          · {new Date(n.created_at).toLocaleString()}
                        </span>
                        <div className="text-[var(--ink-2)] mt-0.5">{n.note}</div>
                      </div>
                    ))}
                  </div>
                )}

                {canWrite && (
                  <div className="flex items-center gap-2 pt-1">
                    <MessageSquarePlus size={15} className="text-[var(--muted)] shrink-0" />
                    <input
                      type="text"
                      value={noteDrafts[item.id] || ''}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddNote(item.id);
                        }
                      }}
                      placeholder="Add timestamped staff note..."
                      className="admin-input flex-1 px-3 py-1.5 text-[12.5px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddNote(item.id)}
                      className="btn-ghost px-3 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send size={12} />
                      <span>Add</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
