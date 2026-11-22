export type ThemeMode = 'light' | 'dark' | 'system';
export type WallpaperId = 'wall-dusk' | 'wall-street' | 'wall-room';

export type MainRoute =
  | 'home'
  | 'hardware'
  | 'cms'
  | 'enquiries'
  | 'bihar-updates'
  | 'access'
  | 'settings'
  | 'help';

export type CmsTab =
  | 'business'
  | 'hero'
  | 'portrait'
  | 'website'
  | 'services'
  | 'gallery'
  | 'testimonials'
  | 'faqs';

export type SettingsTab = 'appearance' | 'alerts' | 'data';

export type AdminRoleName = 'Super Admin' | 'Admin' | 'Editor' | 'Content Manager';

export interface AdminUserSession {
  id: string;
  email: string;
  fullName: string;
  designation: string;
  roleId: string;
  roleName: AdminRoleName;
  permissions: string[];
  isActive: boolean;
}

export interface IntegrationStatus {
  supabaseConfigured: boolean;
  firebaseConfigured: boolean;
  fcmServerConfigured: boolean;
  birefnetConfigured: boolean;
  geminiConfigured: boolean;
}

export interface BusinessProfile {
  id: number;
  business_name: string;
  dashboard_subtitle: string;
  logo_url: string | null;
  favicon_url: string | null;
  address: string;
  contact_number: string;
  whatsapp_number: string;
  email: string;
  business_hours: string;
  google_maps_url: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    telegram?: string;
  };
  about_summary: string;
  updated_at: string;
}

export interface HeroSection {
  id: number;
  badge_label: string;
  main_headline: string;
  supporting_headline: string;
  hero_description: string;
  announcement_text: string;
  owner_portrait_url: string | null;
  primary_cta_label: string;
  primary_cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
  updated_at: string;
}

export interface OwnerProfile {
  id: number;
  full_name: string;
  designation: string;
  biography: string;
  profile_photo_url: string | null;
  socialLinks: {
    whatsapp?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
  };
  updated_at: string;
}

export interface ReferencePortrait {
  id: string;
  original_url: string;
  original_mime: string;
  bg_removal_enabled: number | boolean;
  processed_url: string | null;
  processing_status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';
  error_message: string | null;
  is_approved: number | boolean;
  approved_at: string | null;
  created_at: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  display_order: number;
}

export interface ServiceItem {
  id: string;
  category_id: string | null;
  category_name: string;
  title: string;
  description: string;
  icon_name: string;
  image_url: string | null;
  price_label: string | null;
  is_featured: number | boolean;
  is_published: number | boolean;
  display_order: number;
  updated_at: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  caption: string;
  image_url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  display_order: number;
  is_published: number | boolean;
  created_at: string;
}

export interface TestimonialItem {
  id: string;
  customer_name: string;
  feedback: string;
  rating: number;
  is_approved: number | boolean;
  is_published: number | boolean;
  created_at: string;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: number | boolean;
  updated_at: string;
}

export interface EnquiryNote {
  id: string;
  enquiry_id: string;
  author_name: string;
  note: string;
  created_at: string;
}

export interface EnquiryItem {
  id: string;
  channel: 'contact_form' | 'whatsapp' | 'walk_in';
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  service_interest: string;
  message: string;
  status: 'new' | 'in_progress' | 'resolved' | 'archived';
  created_at: string;
  updated_at: string;
  notes: EnquiryNote[];
}

export interface WebsiteSettings {
  id: number;
  seo_title: string;
  seo_description: string;
  og_image_url: string | null;
  favicon_url: string | null;
  theme_mode: ThemeMode;
  announcement_enabled: number | boolean;
  announcement_text: string;
  footer_text: string;
  contact_email: string;
  contact_phone: string;
  updated_at: string;
}

export type BiharCategory =
  | 'Government Schemes'
  | 'Latest Government Jobs'
  | 'Admit Cards'
  | 'Results'
  | 'Education'
  | 'Scholarships'
  | 'Government Notifications'
  | 'Government Orders'
  | 'Agriculture'
  | 'Important Announcements';

export interface GovtSource {
  id: string;
  name: string;
  department: string;
  source_url: string;
  source_type: 'rss' | 'api' | 'website';
  default_category: BiharCategory;
  is_trusted: number | boolean;
  auto_publish: number | boolean;
  is_active: number | boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  last_status: 'success' | 'partial' | 'error' | null;
  last_error: string | null;
}

export interface GovtUpdateItem {
  id: string;
  source_id: string | null;
  content_hash: string;
  title: string;
  description: string;
  hindi_summary: string | null;
  category: BiharCategory;
  source_url: string;
  pdf_url: string | null;
  official_image_url: string | null;
  status: 'pending' | 'published' | 'rejected' | 'expired';
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface GovtFetchLog {
  id: string;
  source_id: string | null;
  source_name: string;
  status: 'success' | 'partial' | 'error';
  items_found: number;
  items_inserted: number;
  duplicates_skipped: number;
  duration_ms: number;
  error_message: string | null;
  fetched_at: string;
}

export interface AdminNotification {
  id: string;
  kind: 'new_enquiry' | 'pending_content' | 'govt_update' | 'failed_fetch' | 'admin_activity';
  title: string;
  body: string;
  route: string;
  is_read: number | boolean;
  created_at: string;
}

export interface DashboardMetrics {
  totalServices: number;
  publishedServices: number;
  totalEnquiries: number;
  pendingEnquiries: number;
  publishedGovtUpdates: number;
  pendingGovtUpdates: number;
  galleryImages: number;
  unreadNotifications: number;
}

export interface ActivityLogEntry {
  id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  module: string;
  target_id: string | null;
  created_at: string;
}

export interface LoginLogEntry {
  id: string;
  email: string;
  event_type: string;
  ip_address: string | null;
  created_at: string;
}

export interface RoleRecord {
  id: string;
  name: AdminRoleName;
  description: string;
}

export interface PermissionRecord {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface RolePermissionMapping {
  roleId: string;
  roleName: AdminRoleName;
  permissions: string[];
}

export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  designation: string;
  role_id: string;
  role_name: AdminRoleName;
  is_active: number | boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  wallpaper: WallpaperId;
  frost: number;
  collapsedRail: boolean;
}

export interface HelpFaqItem {
  id: string;
  topic: string;
  question: string;
  answer: string;
}

export interface SupportTicket {
  id: string;
  topic: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'Open' | 'Replied';
}
