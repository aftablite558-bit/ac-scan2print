import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Layers, Plus, Star, Trash2, Upload } from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import { compressImageForUpload } from '../lib/imageOptimizer';
import type { GalleryItem, ServiceItem } from '../types/admin';
import { popIcon, revealCards, revealText } from '../utils/animations';

export const CatalogCmsPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    serviceCategories,
    services,
    galleryItems,
    uploadFile,
    createService,
    updateService,
    deleteService,
    createGalleryItem,
    updateGalleryItem,
    deleteGalleryItem,
    showToast,
  } = useAdmin();

  const activeTab = (route.sub as 'services' | 'gallery') || 'services';
  const canWrite = can('cms.write');

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // Service Form State
  const [svcTitle, setSvcTitle] = useState('');
  const [svcCategoryId, setSvcCategoryId] = useState('');
  const [svcPriceLabel, setSvcPriceLabel] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcFeatured, setSvcFeatured] = useState(true);
  const [svcPublished, setSvcPublished] = useState(true);
  const [svcBusy, setSvcBusy] = useState(false);

  // Gallery Form State
  const [galTitle, setGalTitle] = useState('');
  const [galCategory, setGalCategory] = useState('Printing Studio');
  const [galCaption, setGalCaption] = useState('');
  const [galFile, setGalFile] = useState<File | null>(null);
  const [galBusy, setGalBusy] = useState(false);

  useEffect(() => {
    if (!svcCategoryId && serviceCategories.length > 0) {
      setSvcCategoryId(serviceCategories[0].id);
    }
  }, [serviceCategories, svcCategoryId]);

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

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcTitle.trim()) return;
    setSvcBusy(true);
    try {
      const cat = serviceCategories.find((c) => c.id === svcCategoryId);
      await createService({
        title: svcTitle.trim(),
        category_id: cat?.id || null,
        category_name: cat?.name || 'Printing & Xerox',
        price_label: svcPriceLabel.trim() || null,
        description: svcDesc.trim(),
        icon_name: 'printer',
        is_featured: svcFeatured ? 1 : 0,
        is_published: svcPublished ? 1 : 0,
        display_order: services.length + 1,
      });
      setSvcTitle('');
      setSvcPriceLabel('');
      setSvcDesc('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create service', 'bad');
    } finally {
      setSvcBusy(false);
    }
  };

  const handleToggleServiceField = async (
    svc: ServiceItem,
    field: 'is_published' | 'is_featured'
  ) => {
    try {
      await updateService(svc.id, { [field]: svc[field] ? 0 : 1 });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'bad');
    }
  };

  const handleCreateGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galTitle.trim() || !galFile) {
      showToast('Provide a title and choose an image file', 'bad');
      return;
    }
    setGalBusy(true);
    try {
      const compressed = await compressImageForUpload(galFile, 1600, 0.84);
      const uploaded = await uploadFile('gallery-media', compressed.file);
      await createGalleryItem({
        title: galTitle.trim(),
        category: galCategory.trim() || 'Printing Studio',
        caption: galCaption.trim(),
        image_url: uploaded.url,
        thumbnail_url: uploaded.url,
        width: compressed.width,
        height: compressed.height,
        file_size_bytes: uploaded.sizeBytes,
        display_order: galleryItems.length + 1,
        is_published: 1,
      });
      setGalTitle('');
      setGalCaption('');
      setGalFile(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gallery upload failed', 'bad');
    } finally {
      setGalBusy(false);
    }
  };

  const handleToggleGalleryPublished = async (item: GalleryItem) => {
    try {
      await updateGalleryItem(item.id, { is_published: item.is_published ? 0 : 1 });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'bad');
    }
  };

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Services & Gallery CMS
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Curate AMAN COMPUTER printing services, cyber desk offerings, and WebP-compressed shop photos.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'services',
            label: 'Services Catalog',
            href: '#/cms/services',
            count: services.length,
          },
          {
            id: 'gallery',
            label: 'Media Gallery',
            href: '#/cms/gallery',
            count: galleryItems.length,
          },
        ]}
      />

      {activeTab === 'services' && (
        <div className="space-y-5">
          {canWrite && (
            <form
              onSubmit={handleCreateService}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[16.5px] font-bold flex items-center gap-2">
                  <Layers size={16} className="text-[var(--accent)]" />
                  <span>Add Printing or Cyber Service</span>
                </h2>
                <button
                  type="submit"
                  disabled={svcBusy}
                  onClick={(e) => popIcon(e.currentTarget)}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{svcBusy ? 'Adding...' : 'Add Service'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Service Title
                  </label>
                  <input
                    type="text"
                    required
                    value={svcTitle}
                    onChange={(e) => setSvcTitle(e.target.value)}
                    placeholder="e.g. Color Laser Printing & Spiral Binding"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Category
                  </label>
                  <select
                    value={svcCategoryId}
                    onChange={(e) => setSvcCategoryId(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  >
                    {serviceCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Starting Price Label
                  </label>
                  <input
                    type="text"
                    value={svcPriceLabel}
                    onChange={(e) => setSvcPriceLabel(e.target.value)}
                    placeholder="e.g. Starts ₹2 / page"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={svcDesc}
                    onChange={(e) => setSvcDesc(e.target.value)}
                    placeholder="Describe paper grades, turnaround time, and document support..."
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-[13px]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={svcFeatured}
                    onChange={(e) => setSvcFeatured(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Featured on homepage</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={svcPublished}
                    onChange={(e) => setSvcPublished(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Publish immediately</span>
                </label>
              </div>
            </form>
          )}

          {services.length === 0 ? (
            <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
              No services added yet. Create your first AMAN COMPUTER service above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((svc) => (
                <article
                  key={svc.id}
                  className="anim-card glass-pane rounded-[22px] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[11px] font-semibold text-[var(--muted)]">
                          {svc.category_name}
                        </span>
                        <h3 className="text-[16.5px] font-bold mt-2">{svc.title}</h3>
                      </div>
                      {svc.price_label && (
                        <span className="px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] text-[12px] font-semibold shrink-0">
                          {svc.price_label}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed">
                      {svc.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => void handleToggleServiceField(svc, 'is_published')}
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          svc.is_published
                            ? 'bg-[var(--good-soft)] text-[var(--good)]'
                            : 'bg-[var(--card-2)] text-[var(--muted)]'
                        }`}
                      >
                        {svc.is_published ? <Eye size={12} /> : <EyeOff size={12} />}
                        <span>{svc.is_published ? 'Published' : 'Draft'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => void handleToggleServiceField(svc, 'is_featured')}
                        className={`px-3 py-1 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          svc.is_featured
                            ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'bg-[var(--card-2)] text-[var(--muted)]'
                        }`}
                      >
                        <Star size={12} />
                        <span>{svc.is_featured ? 'Featured' : 'Standard'}</span>
                      </button>
                    </div>

                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete ${svc.title}`}
                        onClick={() => void deleteService(svc.id)}
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

      {activeTab === 'gallery' && (
        <div className="space-y-5">
          {canWrite && (
            <form
              onSubmit={handleCreateGallery}
              className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[16.5px] font-bold flex items-center gap-2">
                    <ImagePlus size={16} className="text-[var(--accent)]" />
                    <span>Upload Gallery Image (Auto WebP Optimization)</span>
                  </h2>
                  <p className="text-[12px] text-[var(--muted)]">
                    Images are compressed client-side to WebP before upload to minimize bandwidth.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={galBusy}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                >
                  <Upload size={14} />
                  <span>{galBusy ? 'Optimizing & Uploading...' : 'Upload to Gallery'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={galTitle}
                    onChange={(e) => setGalTitle(e.target.value)}
                    placeholder="e.g. High-Speed Xerox Station"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={galCategory}
                    onChange={(e) => setGalCategory(e.target.value)}
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Image File
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={(e) => setGalFile(e.target.files?.[0] || null)}
                    className="admin-input w-full px-3 py-1.5 text-[12.5px]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1">
                    Caption
                  </label>
                  <input
                    type="text"
                    value={galCaption}
                    onChange={(e) => setGalCaption(e.target.value)}
                    placeholder="Optional caption displayed under the photo"
                    className="admin-input w-full px-3.5 py-2 text-[13.5px]"
                  />
                </div>
              </div>
            </form>
          )}

          {galleryItems.length === 0 ? (
            <div className="anim-card glass-pane rounded-[24px] p-8 text-center text-[13.5px] text-[var(--muted)]">
              No gallery photos uploaded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {galleryItems.map((item) => (
                <article
                  key={item.id}
                  className="anim-card glass-pane rounded-[22px] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-[16/10] bg-black/15 overflow-hidden">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                          {item.category}
                        </span>
                        {item.width && item.height && (
                          <span className="text-[11px] text-[var(--muted)] tabular-nums">
                            {item.width}×{item.height}
                          </span>
                        )}
                      </div>
                      <h3 className="text-[15px] font-bold mt-1">{item.title}</h3>
                      {item.caption && (
                        <p className="text-[12.5px] text-[var(--muted)] mt-1">{item.caption}</p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-[var(--line)] flex items-center justify-between">
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => void handleToggleGalleryPublished(item)}
                      className={`px-3 py-1 rounded-full text-[12px] font-semibold cursor-pointer ${
                        item.is_published
                          ? 'bg-[var(--good-soft)] text-[var(--good)]'
                          : 'bg-[var(--card-2)] text-[var(--muted)]'
                      }`}
                    >
                      {item.is_published ? 'Published' : 'Hidden'}
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => void deleteGalleryItem(item.id)}
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
