import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Globe,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import type { BusinessProfile, HeroSection, OwnerProfile, WebsiteSettings } from '../types/admin';
import { isPortraitReadyForApproval } from '../utils/adminLogic';
import { popIcon, revealCards, revealText } from '../utils/animations';

export const BusinessCmsPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    businessProfile,
    heroSection,
    ownerProfile,
    websiteSettings,
    referencePortraits,
    integrations,
    uploadFile,
    saveBusinessProfile,
    saveHeroSection,
    saveOwnerProfile,
    saveWebsiteSettings,
    uploadReferencePortrait,
    retryReferencePortrait,
    approveReferencePortrait,
    showToast,
  } = useAdmin();

  const activeTab =
    (route.sub as 'business' | 'hero' | 'portrait' | 'website') || 'business';
  const canWrite = can('cms.write');
  const canApprovePortrait = can('portrait.approve') || can('cms.write');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [bizForm, setBizForm] = useState<BusinessProfile | null>(businessProfile);
  const [heroForm, setHeroForm] = useState<HeroSection | null>(heroSection);
  const [ownerForm, setOwnerForm] = useState<OwnerProfile | null>(ownerProfile);
  const [webForm, setWebForm] = useState<WebsiteSettings | null>(websiteSettings);
  const [saving, setSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
  const [bgRemovalEnabled, setBgRemovalEnabled] = useState(true);
  const [portraitBusy, setPortraitBusy] = useState(false);

  useEffect(() => {
    setBizForm(businessProfile);
  }, [businessProfile]);

  useEffect(() => {
    setHeroForm(heroSection);
  }, [heroSection]);

  useEffect(() => {
    setOwnerForm(ownerProfile);
  }, [ownerProfile]);

  useEffect(() => {
    setWebForm(websiteSettings);
  }, [websiteSettings]);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.04,
      stagger: 0.06,
    });
  }, [activeTab]);

  const handleAssetUpload = async (
    bucket: 'business-assets' | 'owner-portraits',
    file: File | undefined,
    onUrl: (url: string) => void,
    label: string
  ) => {
    if (!file) return;
    setUploadingAsset(label);
    try {
      const res = await uploadFile(bucket, file);
      onUrl(res.url);
      showToast(`${label} uploaded`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'bad');
    } finally {
      setUploadingAsset(null);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizForm) return;
    setSaving(true);
    try {
      await saveBusinessProfile(bizForm);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save business profile', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHero = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroForm) return;
    setSaving(true);
    try {
      await saveHeroSection(heroForm);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save hero section', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerForm) return;
    setSaving(true);
    try {
      await saveOwnerProfile(ownerForm);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save owner profile', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webForm) return;
    setSaving(true);
    try {
      await saveWebsiteSettings(webForm);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save website settings', 'bad');
    } finally {
      setSaving(false);
    }
  };

  const handlePortraitUpload = async (file: File | undefined) => {
    if (!file) return;
    setPortraitBusy(true);
    try {
      await uploadReferencePortrait(file, bgRemovalEnabled);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Portrait upload failed', 'bad');
    } finally {
      setPortraitBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Business & Hero CMS
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Manage AMAN COMPUTER brand identity, hero showcase, owner AI portrait, and SEO metadata.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          { id: 'business', label: 'Business Profile', href: '#/cms/business' },
          { id: 'hero', label: 'Hero Section', href: '#/cms/hero' },
          {
            id: 'portrait',
            label: 'Owner & AI Portrait',
            href: '#/cms/portrait',
            count: referencePortraits.length,
          },
          { id: 'website', label: 'Website & SEO', href: '#/cms/website' },
        ]}
      />

      {((activeTab === 'business' && !bizForm) ||
        (activeTab === 'hero' && !heroForm) ||
        (activeTab === 'website' && !webForm)) && (
        <section className="anim-card glass-pane rounded-[24px] p-6 max-w-[920px] space-y-3">
          <h2 className="text-[17px] font-bold">Local CMS Backend Not Active</h2>
          <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
            Business Profile, Hero Section, and Website SEO records load from the optional local Express CMS API (
            <code>/api/cms/state</code>). On static Firebase Hosting, manage printers and QR print payment settings in{' '}
            <strong className="text-[var(--ink)]">Hardware &amp; Printers</strong> or display preferences in{' '}
            <strong className="text-[var(--ink)]">Settings</strong>.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => navigate('#/hardware')}
              className="btn-primary px-4 py-2 rounded-full text-[13px] cursor-pointer"
            >
              Open Hardware &amp; Printers
            </button>
            <button
              type="button"
              onClick={() => navigate('#/settings')}
              className="btn-ghost px-4 py-2 rounded-full text-[13px] cursor-pointer"
            >
              Open Settings
            </button>
          </div>
        </section>
      )}

      {/* Business Profile Tab */}
      {activeTab === 'business' && bizForm && (
        <form onSubmit={handleSaveBusiness} className="space-y-4 max-w-[920px]">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Core Identity & Contact</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Synced across header branding, footer, and customer contact channels
                </p>
              </div>
              <button
                type="submit"
                disabled={!canWrite || saving}
                onClick={(e) => popIcon(e.currentTarget)}
                className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Business Profile'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Business Name
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.business_name}
                  onChange={(e) => setBizForm({ ...bizForm, business_name: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Dashboard Subtitle
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.dashboard_subtitle}
                  onChange={(e) =>
                    setBizForm({ ...bizForm, dashboard_subtitle: e.target.value })
                  }
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Contact Number
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.contact_number}
                  onChange={(e) => setBizForm({ ...bizForm, contact_number: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  WhatsApp Number
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.whatsapp_number}
                  onChange={(e) => setBizForm({ ...bizForm, whatsapp_number: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Public Contact Email
                </label>
                <input
                  type="email"
                  disabled={!canWrite}
                  value={bizForm.email}
                  onChange={(e) => setBizForm({ ...bizForm, email: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Business Hours
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.business_hours}
                  onChange={(e) => setBizForm({ ...bizForm, business_hours: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Shop Address
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={bizForm.address}
                  onChange={(e) => setBizForm({ ...bizForm, address: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Google Maps URL
                </label>
                <input
                  type="url"
                  disabled={!canWrite}
                  value={bizForm.google_maps_url}
                  onChange={(e) => setBizForm({ ...bizForm, google_maps_url: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  About Summary
                </label>
                <textarea
                  rows={3}
                  disabled={!canWrite}
                  value={bizForm.about_summary}
                  onChange={(e) => setBizForm({ ...bizForm, about_summary: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--line)] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Brand Logo
                </label>
                <div className="flex items-center gap-3">
                  {bizForm.logo_url ? (
                    <img
                      src={bizForm.logo_url}
                      alt="Brand Logo"
                      className="w-12 h-12 rounded-[12px] object-cover border border-[var(--line)]"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-center font-bold">
                      A
                    </div>
                  )}
                  <label className="btn-ghost px-3.5 py-2 rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload size={14} />
                    <span>{uploadingAsset === 'Logo' ? 'Uploading...' : 'Upload Logo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!canWrite}
                      className="hidden"
                      onChange={(e) =>
                        void handleAssetUpload(
                          'business-assets',
                          e.target.files?.[0],
                          (url) => setBizForm({ ...bizForm, logo_url: url }),
                          'Logo'
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Favicon
                </label>
                <div className="flex items-center gap-3">
                  {bizForm.favicon_url ? (
                    <img
                      src={bizForm.favicon_url}
                      alt="Favicon"
                      className="w-12 h-12 rounded-[12px] object-cover border border-[var(--line)]"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-center">
                      <Globe size={16} />
                    </div>
                  )}
                  <label className="btn-ghost px-3.5 py-2 rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload size={14} />
                    <span>{uploadingAsset === 'Favicon' ? 'Uploading...' : 'Upload Favicon'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!canWrite}
                      className="hidden"
                      onChange={(e) =>
                        void handleAssetUpload(
                          'business-assets',
                          e.target.files?.[0],
                          (url) => setBizForm({ ...bizForm, favicon_url: url }),
                          'Favicon'
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--line)] grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['facebook', 'instagram', 'youtube', 'telegram'] as const).map((net) => (
                <div key={net}>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 capitalize">
                    {net} URL
                  </label>
                  <input
                    type="url"
                    disabled={!canWrite}
                    value={bizForm.socialLinks?.[net] || ''}
                    onChange={(e) =>
                      setBizForm({
                        ...bizForm,
                        socialLinks: { ...bizForm.socialLinks, [net]: e.target.value },
                      })
                    }
                    placeholder={`https://${net}.com/...`}
                    className="admin-input w-full px-3.5 py-2 text-[13px]"
                  />
                </div>
              ))}
            </div>
          </section>
        </form>
      )}

      {/* Hero Section Tab */}
      {activeTab === 'hero' && heroForm && (
        <form onSubmit={handleSaveHero} className="space-y-4 max-w-[920px]">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Hero Headline & Call-to-Actions</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Controls the primary hero banner copy, announcement bar, and action links
                </p>
              </div>
              <button
                type="submit"
                disabled={!canWrite || saving}
                onClick={(e) => popIcon(e.currentTarget)}
                className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Hero Section'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Badge Label
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.badge_label}
                  onChange={(e) => setHeroForm({ ...heroForm, badge_label: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Announcement Text
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.announcement_text}
                  onChange={(e) => setHeroForm({ ...heroForm, announcement_text: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Main Headline
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.main_headline}
                  onChange={(e) => setHeroForm({ ...heroForm, main_headline: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[14px] font-semibold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Supporting Headline
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.supporting_headline}
                  onChange={(e) =>
                    setHeroForm({ ...heroForm, supporting_headline: e.target.value })
                  }
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Hero Description
                </label>
                <textarea
                  rows={3}
                  disabled={!canWrite}
                  value={heroForm.hero_description}
                  onChange={(e) => setHeroForm({ ...heroForm, hero_description: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Primary CTA Label
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.primary_cta_label}
                  onChange={(e) => setHeroForm({ ...heroForm, primary_cta_label: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Primary CTA Link
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.primary_cta_href}
                  onChange={(e) => setHeroForm({ ...heroForm, primary_cta_href: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Secondary CTA Label
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.secondary_cta_label}
                  onChange={(e) =>
                    setHeroForm({ ...heroForm, secondary_cta_label: e.target.value })
                  }
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Secondary CTA Link
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={heroForm.secondary_cta_href}
                  onChange={(e) => setHeroForm({ ...heroForm, secondary_cta_href: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
            </div>
          </section>
        </form>
      )}

      {/* Owner & AI Portrait Tab */}
      {activeTab === 'portrait' && (
        <div className="space-y-4 max-w-[980px]">
          {ownerForm && (
            <form
              onSubmit={handleSaveOwner}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold">Owner Profile</h2>
                  <p className="text-[12.5px] text-[var(--muted)]">
                    Proprietor biography and synced portrait photo
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!canWrite || saving}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Owner Profile'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                <div className="sm:col-span-3 flex flex-col items-center gap-3">
                  <div className="w-28 h-28 rounded-[20px] overflow-hidden bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-center">
                    {ownerForm.profile_photo_url ? (
                      <img
                        src={ownerForm.profile_photo_url}
                        alt={ownerForm.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserCheck size={28} className="text-[var(--muted)]" />
                    )}
                  </div>
                  <label className="btn-ghost px-3 py-1.5 rounded-full text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload size={13} />
                    <span>Direct Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!canWrite}
                      className="hidden"
                      onChange={(e) =>
                        void handleAssetUpload(
                          'owner-portraits',
                          e.target.files?.[0],
                          (url) => setOwnerForm({ ...ownerForm, profile_photo_url: url }),
                          'Owner Photo'
                        )
                      }
                    />
                  </label>
                </div>

                <div className="sm:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      disabled={!canWrite}
                      value={ownerForm.full_name}
                      onChange={(e) => setOwnerForm({ ...ownerForm, full_name: e.target.value })}
                      className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                      Designation
                    </label>
                    <input
                      type="text"
                      disabled={!canWrite}
                      value={ownerForm.designation}
                      onChange={(e) => setOwnerForm({ ...ownerForm, designation: e.target.value })}
                      className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                      Biography
                    </label>
                    <textarea
                      rows={3}
                      disabled={!canWrite}
                      value={ownerForm.biography}
                      onChange={(e) => setOwnerForm({ ...ownerForm, biography: e.target.value })}
                      className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* BiRefNet AI Reference Portrait Studio */}
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--accent-text)] mb-1">
                  <Sparkles size={14} />
                  <span>BiRefNet AI Reference Portrait Pipeline</span>
                </div>
                <h2 className="text-[17px] font-bold">Upload & Approve Reference Portrait</h2>
                <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                  Original photos are never overwritten. BiRefNet service:{' '}
                  <strong>
                    {integrations.birefnetConfigured ? 'Connected' : 'BIREFNET_API_URL unset (skip or retry)'}
                  </strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bgRemovalEnabled}
                    onChange={(e) => setBgRemovalEnabled(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Run BiRefNet BG Removal</span>
                </label>

                <label className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 cursor-pointer">
                  <Upload size={14} />
                  <span>{portraitBusy ? 'Processing...' : 'Upload Reference Portrait'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!canWrite || portraitBusy}
                    className="hidden"
                    onChange={(e) => void handlePortraitUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            {referencePortraits.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[var(--line-2)] p-6 text-center text-[13px] text-[var(--muted)]">
                No reference portraits uploaded yet. Upload a clear portrait above to preview and approve it into Owner Profile & Hero Section.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {referencePortraits.map((p) => {
                  const ready = isPortraitReadyForApproval(p);
                  return (
                    <article
                      key={p.id}
                      className="rounded-[20px] bg-[var(--card-2)] border border-[var(--line)] p-4 space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] font-semibold text-[var(--muted)] mb-1">
                            Original
                          </div>
                          <div className="aspect-square rounded-[14px] overflow-hidden bg-black/15 border border-[var(--line)]">
                            <img
                              src={p.original_url}
                              alt="Original portrait"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-[var(--muted)] mb-1">
                            Processed ({p.processing_status})
                          </div>
                          <div className="aspect-square rounded-[14px] overflow-hidden bg-black/15 border border-[var(--line)] flex items-center justify-center p-2 text-center">
                            {p.processed_url ? (
                              <img
                                src={p.processed_url}
                                alt="Processed portrait"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[11.5px] text-[var(--muted)]">
                                {p.processing_status === 'skipped'
                                  ? 'BG removal skipped (original ready)'
                                  : p.error_message || 'No cutout generated'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {p.error_message && (
                        <div className="rounded-[12px] bg-[var(--bad-soft)] text-[var(--bad)] px-3 py-2 text-[12px] flex items-start gap-2">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          <span>{p.error_message}</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11.5px] text-[var(--muted)]">
                          {p.is_approved ? 'Approved & Live' : new Date(p.created_at).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => void retryReferencePortrait(p.id, true)}
                            className="btn-ghost px-3 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw size={12} />
                            <span>Retry AI</span>
                          </button>
                          {p.bg_removal_enabled ? (
                            <button
                              type="button"
                              disabled={!canWrite}
                              onClick={() => void retryReferencePortrait(p.id, false)}
                              className="btn-ghost px-3 py-1.5 rounded-full text-[12px] cursor-pointer"
                            >
                              Use Original
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={!canApprovePortrait || !ready}
                            onClick={() =>
                              void approveReferencePortrait(p.id).catch((err) =>
                                showToast(
                                  err instanceof Error ? err.message : 'Approval blocked',
                                  'bad'
                                )
                              )
                            }
                            className="btn-primary px-3.5 py-1.5 rounded-full text-[12px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                          >
                            <CheckCircle2 size={13} />
                            <span>{p.is_approved ? 'Synced' : 'Approve & Sync'}</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Website & SEO Settings Tab */}
      {activeTab === 'website' && webForm && (
        <form onSubmit={handleSaveWebsite} className="space-y-4 max-w-[920px]">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Public Website SEO & Announcement Bar</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Search metadata, OpenGraph preview image, and site-wide footer text
                </p>
              </div>
              <button
                type="submit"
                disabled={!canWrite || saving}
                className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Website Settings'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  SEO Title
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={webForm.seo_title}
                  onChange={(e) => setWebForm({ ...webForm, seo_title: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  SEO Meta Description
                </label>
                <textarea
                  rows={3}
                  disabled={!canWrite}
                  value={webForm.seo_description}
                  onChange={(e) => setWebForm({ ...webForm, seo_description: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Public Contact Email
                </label>
                <input
                  type="email"
                  disabled={!canWrite}
                  value={webForm.contact_email}
                  onChange={(e) => setWebForm({ ...webForm, contact_email: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Public Contact Phone
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={webForm.contact_phone}
                  onChange={(e) => setWebForm({ ...webForm, contact_phone: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-[16px] bg-[var(--card-2)] border border-[var(--line)] p-4">
                <div>
                  <div className="text-[13.5px] font-semibold">Announcement Banner</div>
                  <div className="text-[12px] text-[var(--muted)]">
                    Show top announcement strip on the public website
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!canWrite}
                  checked={Boolean(webForm.announcement_enabled)}
                  onChange={(e) =>
                    setWebForm({ ...webForm, announcement_enabled: e.target.checked ? 1 : 0 })
                  }
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Announcement Text
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={webForm.announcement_text}
                  onChange={(e) => setWebForm({ ...webForm, announcement_text: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                  Footer Copyright & Tagline
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={webForm.footer_text}
                  onChange={(e) => setWebForm({ ...webForm, footer_text: e.target.value })}
                  className="admin-input w-full px-3.5 py-2.5 text-[13.5px]"
                />
              </div>
            </div>
          </section>
        </form>
      )}
    </div>
  );
};
