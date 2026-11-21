import React, { useEffect, useRef, useState } from 'react';
import { Check, HelpCircle, MessageSquareQuote, Plus, Star, Trash2 } from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import { popIcon, revealCards, revealText } from '../utils/animations';

export const EngagementCmsPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    testimonials,
    faqs,
    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
    createFaq,
    updateFaq,
    deleteFaq,
    showToast,
  } = useAdmin();

  const activeTab = (route.sub as 'testimonials' | 'faqs') || 'testimonials';
  const canWrite = can('cms.write');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [custName, setCustName] = useState('');
  const [custRating, setCustRating] = useState(5);
  const [custFeedback, setCustFeedback] = useState('');
  const [busyTesti, setBusyTesti] = useState(false);

  const [faqCategory, setFaqCategory] = useState('Printing Services');
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [busyFaq, setBusyFaq] = useState(false);

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

  const handleAddTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custFeedback.trim()) return;
    setBusyTesti(true);
    try {
      await createTestimonial({
        customer_name: custName.trim(),
        rating: custRating,
        feedback: custFeedback.trim(),
        is_approved: 1,
        is_published: 1,
      });
      setCustName('');
      setCustFeedback('');
      setCustRating(5);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add testimonial', 'bad');
    } finally {
      setBusyTesti(false);
    }
  };

  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setBusyFaq(true);
    try {
      await createFaq({
        category: faqCategory.trim() || 'General',
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
        display_order: faqs.length + 1,
        is_published: 1,
      });
      setFaqQuestion('');
      setFaqAnswer('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create FAQ', 'bad');
    } finally {
      setBusyFaq(false);
    }
  };

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Reviews & FAQ CMS
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Moderate customer testimonials and manage frequently asked printing & cyber cafe questions.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'testimonials',
            label: 'Testimonials',
            href: '#/cms/testimonials',
            count: testimonials.length,
          },
          {
            id: 'faqs',
            label: 'Website FAQs',
            href: '#/cms/faqs',
            count: faqs.length,
          },
        ]}
      />

      {activeTab === 'testimonials' && (
        <div className="space-y-5 max-w-[960px]">
          {canWrite && (
            <form
              onSubmit={handleAddTestimonial}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16.5px] font-bold flex items-center gap-2">
                  <MessageSquareQuote size={16} className="text-[var(--accent)]" />
                  <span>Add Customer Testimonial</span>
                </h2>
                <button
                  type="submit"
                  disabled={busyTesti}
                  onClick={(e) => popIcon(e.currentTarget)}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{busyTesti ? 'Saving...' : 'Add Testimonial'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                <div className="sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Rating
                  </label>
                  <select
                    value={custRating}
                    onChange={(e) => setCustRating(Number(e.target.value))}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {r} Stars
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Feedback
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={custFeedback}
                    onChange={(e) => setCustFeedback(e.target.value)}
                    placeholder="Customer review text..."
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
              </div>
            </form>
          )}

          {testimonials.length === 0 ? (
            <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
              No testimonials saved yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testimonials.map((t) => (
                <article
                  key={t.id}
                  className="anim-card glass-pane rounded-[22px] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-[15px]">{t.customer_name}</div>
                      <div className="inline-flex items-center gap-0.5 text-[var(--warn)]">
                        {Array.from({ length: t.rating }).map((_, idx) => (
                          <Star key={idx} size={13} fill="currentColor" />
                        ))}
                      </div>
                    </div>
                    <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed">
                      “{t.feedback}”
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() =>
                          void updateTestimonial(t.id, { is_approved: t.is_approved ? 0 : 1 })
                        }
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          t.is_approved
                            ? 'bg-[var(--good-soft)] text-[var(--good)]'
                            : 'bg-[var(--card-2)] text-[var(--muted)]'
                        }`}
                      >
                        <Check size={12} />
                        <span>{t.is_approved ? 'Approved' : 'Pending'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() =>
                          void updateTestimonial(t.id, { is_published: t.is_published ? 0 : 1 })
                        }
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold cursor-pointer ${
                          t.is_published
                            ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                            : 'bg-[var(--card-2)] text-[var(--muted)]'
                        }`}
                      >
                        {t.is_published ? 'Published' : 'Hidden'}
                      </button>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete testimonial from ${t.customer_name}`}
                        onClick={() => void deleteTestimonial(t.id)}
                        className="w-8 h-8 rounded-[10px] btn-ghost text-[var(--bad)] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'faqs' && (
        <div className="space-y-5 max-w-[960px]">
          {canWrite && (
            <form
              onSubmit={handleAddFaq}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16.5px] font-bold flex items-center gap-2">
                  <HelpCircle size={16} className="text-[var(--accent)]" />
                  <span>Add Website FAQ</span>
                </h2>
                <button
                  type="submit"
                  disabled={busyFaq}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{busyFaq ? 'Saving...' : 'Add FAQ'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={faqCategory}
                    onChange={(e) => setFaqCategory(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Question
                  </label>
                  <input
                    type="text"
                    required
                    value={faqQuestion}
                    onChange={(e) => setFaqQuestion(e.target.value)}
                    placeholder="e.g. What paper sizes are supported for color printouts?"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Answer
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={faqAnswer}
                    onChange={(e) => setFaqAnswer(e.target.value)}
                    placeholder="Clear answer displayed on the website..."
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
              </div>
            </form>
          )}

          {faqs.length === 0 ? (
            <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
              No website FAQs configured yet.
            </div>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <article
                  key={faq.id}
                  className="anim-card glass-pane rounded-[20px] p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[11px] font-semibold text-[var(--muted)]">
                      {faq.category}
                    </span>
                    <h3 className="text-[15.5px] font-bold">{faq.question}</h3>
                    <p className="text-[13px] text-[var(--muted)] leading-relaxed">{faq.answer}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() =>
                        void updateFaq(faq.id, { is_published: faq.is_published ? 0 : 1 })
                      }
                      className={`px-3 py-1 rounded-full text-[12px] font-semibold cursor-pointer ${
                        faq.is_published
                          ? 'bg-[var(--good-soft)] text-[var(--good)]'
                          : 'bg-[var(--card-2)] text-[var(--muted)]'
                      }`}
                    >
                      {faq.is_published ? 'Published' : 'Draft'}
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete FAQ ${faq.question}`}
                        onClick={() => void deleteFaq(faq.id)}
                        className="w-8 h-8 rounded-[10px] btn-ghost text-[var(--bad)] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
