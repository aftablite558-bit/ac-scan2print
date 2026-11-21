import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Send } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { filterFaqs, HELP_FAQS } from '../utils/adminLogic';
import {
  floatGain,
  gsap,
  popIcon,
  reducedMotion,
  revealCards,
  revealRows,
  revealText,
  shakeEl,
} from '../utils/animations';

export const HelpPage: React.FC = () => {
  const { currentUser, enquiries, can, createEnquiry, showToast } = useAdmin();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>('faq-1');

  const [topic, setTopic] = useState('BiRefNet Portrait');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const answerRefs = useRef<Record<string, HTMLParagraphElement | null>>({});

  const faqs = useMemo(() => filterFaqs(HELP_FAQS, query), [query]);

  useEffect(() => {
    if (!rootRef.current) return;
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.05,
      stagger: 0.07,
    });
    revealRows(rootRef.current.querySelectorAll<HTMLElement>('.faq-item'), {
      delay: 0.16,
      stagger: 0.035,
    });
  }, []);

  useEffect(() => {
    if (!openId || reducedMotion()) return;
    const el = answerRefs.current[openId];
    if (el) {
      gsap.fromTo(
        el,
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', clearProps: 'transform,opacity' }
      );
    }
  }, [openId]);

  const canWriteEnquiry = can('enquiries.write');

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Help & Admin Documentation
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Operational guides for AMAN COMPUTER CMS, RBAC security, BiRefNet Portrait, and Door 5 Bihar portals.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Common questions */}
        <section className="anim-card lg:col-span-7 glass-pane rounded-[24px] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-[17px] font-bold">Common questions</h2>
            <p className="text-[12.5px] text-[var(--muted)]">{faqs.length} answers</p>
          </div>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <input
              type="search"
              aria-label="Search the answers"
              placeholder="Search the answers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full admin-input pl-9 pr-3.5 py-2 text-[13.5px]"
            />
          </div>

          <div className="divide-y divide-[var(--line)]">
            {faqs.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`faq-item py-3.5 ${isOpen ? 'is-open' : ''}`}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="w-full flex items-start justify-between gap-4 text-left cursor-pointer group"
                  >
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {faq.topic}
                      </div>
                      <div className="text-[15px] font-bold mt-0.5 group-hover:text-[var(--accent-text)] transition-colors">
                        {faq.question}
                      </div>
                    </div>
                    <span className="faq-ico mt-1 text-[var(--accent)] shrink-0">
                      <Plus size={16} />
                    </span>
                  </button>
                  {isOpen && (
                    <p
                      ref={(el) => {
                        answerRefs.current[faq.id] = el;
                      }}
                      className="text-[13.5px] text-[var(--ink-2)] leading-relaxed mt-2.5 pr-6"
                    >
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Log operational ticket into real DB enquiries */}
        <div className="lg:col-span-5 space-y-4">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-[17px] font-bold">Internal Admin Escalation</h2>
              <p className="text-[12.5px] text-[var(--muted)]">
                Log a follow-up request directly into the Enquiries tracker
              </p>
            </div>

            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault();
                if (!subject.trim() || !message.trim()) {
                  shakeEl(formRef.current);
                  return;
                }
                if (!canWriteEnquiry) {
                  showToast('Missing enquiries.write permission', 'bad');
                  return;
                }
                popIcon(submitRef.current);
                floatGain(submitRef.current, 'Logged', 'good');
                void createEnquiry({
                  channel: 'walk_in',
                  customer_name: currentUser?.fullName || 'Admin Staff',
                  customer_email: currentUser?.email || '',
                  service_interest: `[${topic}] ${subject.trim()}`,
                  message: message.trim(),
                }).then(() => {
                  setSubject('');
                  setMessage('');
                });
              }}
              className="space-y-3.5"
            >
              <div>
                <label htmlFor="help-topic" className="block text-[12px] text-[var(--muted)] mb-1">
                  Module
                </label>
                <select
                  id="help-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full admin-input px-3.5 py-2.5 text-[13.5px]"
                >
                  <option value="BiRefNet Portrait">BiRefNet Portrait</option>
                  <option value="Door 5 Bihar Updates">Door 5 Bihar Updates</option>
                  <option value="RBAC & Security">RBAC & Security</option>
                  <option value="Website CMS">Website CMS</option>
                  <option value="Backup & Data">Backup & Data</option>
                </select>
              </div>

              <div>
                <label htmlFor="help-subject" className="block text-[12px] text-[var(--muted)] mb-1">
                  Subject
                </label>
                <input
                  id="help-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full admin-input px-3.5 py-2.5 text-[13.5px]"
                />
              </div>

              <div>
                <label htmlFor="help-msg" className="block text-[12px] text-[var(--muted)] mb-1">
                  Details
                </label>
                <textarea
                  id="help-msg"
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full admin-input px-3.5 py-2.5 text-[13.5px]"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  ref={submitRef}
                  type="submit"
                  className="magnetic btn-primary px-5 py-2 rounded-full text-[13.5px] inline-flex items-center gap-2 cursor-pointer"
                >
                  <Send size={14} />
                  <span>Log Request</span>
                </button>
              </div>
            </form>
          </section>

          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6">
            <h2 className="text-[17px] font-bold mb-1">Recent Escalations & Enquiries</h2>
            {enquiries.length === 0 ? (
              <p className="text-[13px] text-[var(--muted)]">No enquiries logged yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--line)] mt-3">
                {enquiries.slice(0, 4).map((t) => (
                  <li key={t.id} className="py-2.5 first:pt-1 last:pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[13.5px] truncate">
                        {t.service_interest || t.customer_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--good-soft)] text-[var(--good)] text-[11px] font-semibold">
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[12px] text-[var(--muted)] mt-0.5">
                      {t.customer_name} · {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
