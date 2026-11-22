import React, { useId, useMemo, useState } from 'react';
import { HelpCircle, Plus, Search, Upload } from 'lucide-react';
import { usePortal } from '../context/PortalContext';

interface HelpFaq {
  id: string;
  topic: string;
  question: string;
  answer: string;
}

const CUSTOMER_FAQS: HelpFaq[] = [
  {
    id: 'formats',
    topic: 'Supported Formats',
    question: 'Which document formats can I upload?',
    answer:
      'You can upload PDF documents (.pdf) and images (.jpg, .jpeg, .png). Files are checked for format integrity and page count on the server.',
  },
  {
    id: 'limits',
    topic: 'File Limits',
    question: 'What are the maximum file size and file count limits?',
    answer:
      'Each print request accepts up to 5 files, with a maximum size of 20 MB per file and 1–20 copies per job.',
  },
  {
    id: 'upload',
    topic: 'How to Upload',
    question: 'How do I upload documents from my phone?',
    answer:
      'Tap Upload Document on the Print Home page, tap the upload box to open your phone Files or Photos picker, wait for the progress bar to reach 100%, then continue to Print Options.',
  },
  {
    id: 'options',
    topic: 'Print Options',
    question: 'Why are some paper sizes or double-sided options shown or hidden?',
    answer:
      'Only options supported by Aman Computer counter printers are enabled so you never pay for or select an unsupported print setting.',
  },
  {
    id: 'pricing',
    topic: 'Pricing Confirmation',
    question: 'Is the amount shown before submitting final?',
    answer:
      'The amount shown before submission is an estimate based on detected pages, copies, and active shop pricing rules. Aman Computer counter staff confirm the final amount after reviewing your files.',
  },
  {
    id: 'payment',
    topic: 'Payment Handling',
    question: 'How do UPI and Cash payments work?',
    answer:
      'You can pay via UPI and enter your 6–40 character UTR transaction reference (plus optional screenshot), or select Cash at Counter. All payments require manual confirmation by shop staff before printing begins.',
  },
  {
    id: 'tracking',
    topic: 'Job Tracking',
    question: 'How do I track my print job without creating an account?',
    answer:
      'After submitting, save or copy your private tracking token link. Open Track Job anytime to follow progress from Submitted and Under Review through Printing Queue and Ready for Collection.',
  },
  {
    id: 'failures',
    topic: 'Troubleshooting',
    question: 'What should I do if an upload fails?',
    answer:
      'Tap Retry next to the failed file—your other uploaded files remain safe. Confirm the file is under 20 MB, non-empty, and in PDF, JPG, JPEG, or PNG format.',
  },
  {
    id: 'support',
    topic: 'Counter Help',
    question: 'How do I ask shop staff for help?',
    answer:
      'Visit the Aman Computer print counter with your Job Number (e.g. AC261121-...) and staff can inspect your request or update print preferences for you.',
  },
];

export const HelpPage: React.FC = () => {
  const { capabilities, navigate } = usePortal();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>('formats');
  const searchId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CUSTOMER_FAQS;
    return CUSTOMER_FAQS.filter(
      (item) =>
        item.topic.toLowerCase().includes(q) ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="space-y-4">
      <section className="portal-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-2.5">
          <HelpCircle size={22} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
          <div>
            <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
              Help & Printing Rules
            </h1>
            <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
              Everything you need to know about uploading, pricing, payment verification, and pickup.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={searchId} className="sr-only">
            Search help topics
          </label>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help topics (e.g. PDF, UPI, tracking)..."
              className="portal-input w-full pl-10 pr-3.5 text-[13.5px]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="portal-card-subtle p-5 text-center text-[13px] text-[var(--color-text-muted)]">
            No matching help topics for &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filtered.map((faq) => {
              const isOpen = openId === faq.id;
              return (
                <div key={faq.id} className="py-3">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-accent)]">
                        {faq.topic}
                      </div>
                      <div className="text-[14.5px] font-bold text-[var(--color-text-primary)] mt-0.5">
                        {faq.question}
                      </div>
                    </div>
                    <Plus
                      size={16}
                      className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${
                        isOpen ? 'rotate-45 text-[var(--color-accent)]' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p className="text-[13.5px] text-[var(--color-text-secondary)] mt-2 pr-4 leading-relaxed">
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="portal-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 text-[13px]">
          <div className="font-bold">{capabilities?.shopName || 'AMAN COMPUTER'}</div>
          <div className="text-[var(--color-text-muted)]">
            {capabilities?.shopHours || 'Counter hours apply'} · {capabilities?.shopAddress}
          </div>
          {capabilities?.shopContactPhone && (
            <div className="text-[12.5px] text-[var(--color-text-muted)]">
              Assistance: {capabilities.shopContactPhone}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate('/quick-print/upload')}
          className="portal-btn-primary px-4 py-2.5 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Upload size={16} aria-hidden="true" />
          <span>Upload Document</span>
        </button>
      </section>
    </div>
  );
};
