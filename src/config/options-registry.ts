import type { OptionDefinition } from '@/core/config/options';

export type { OptionDefinition } from '@/core/config/options';

export const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  branding: 'Branding',
  email: 'Email Branding',
  social: 'Social & Analytics',
  ga4: 'Google Analytics 4 (Dashboard)',
  reading: 'Reading',
};

export const OPTION_REGISTRY: OptionDefinition[] = [
  // ─── General ────────────────────────────────────────────────────────────────
  { key: 'site.name', label: 'Site Name', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.tagline', label: 'Tagline', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.description', label: 'Description', group: 'general', type: 'textarea', defaultValue: '' },
  { key: 'site.url', label: 'Site URL', group: 'general', type: 'url', defaultValue: '' },

  // ─── Branding ───────────────────────────────────────────────────────────────
  { key: 'site.logo', label: 'Logo URL', group: 'branding', type: 'url', defaultValue: '' },
  { key: 'site.favicon', label: 'Favicon URL', group: 'branding', type: 'url', defaultValue: '' },

  // ─── Email Branding (overrides site.* in emails) ────────────────────────────
  { key: 'email.site_name', label: 'Email Site Name', description: 'Overrides Site Name in emails. Leave blank to use Site Name.', group: 'email', type: 'text', defaultValue: '' },
  { key: 'email.site_url', label: 'Email Site URL', description: 'Overrides Site URL in emails. Leave blank to use Site URL.', group: 'email', type: 'url', defaultValue: '' },
  { key: 'email.contact_email', label: 'Contact Email', description: 'Shown in email footer. Defaults to FROM_EMAIL env var.', group: 'email', type: 'text', defaultValue: '' },
  { key: 'email.logo_url', label: 'Email Logo URL', description: 'Logo shown in email header. Overrides site logo. Leave blank for text-only header.', group: 'email', type: 'url', defaultValue: '' },
  { key: 'email.brand_color', label: 'Email Brand Color', description: 'Primary button/accent color in emails (hex). Default: #e91e63', group: 'email', type: 'text', defaultValue: '#e91e63' },

  // ─── Social & Analytics ─────────────────────────────────────────────────────
  { key: 'site.social.twitter', label: 'Twitter / X Handle', group: 'social', type: 'text', defaultValue: '' },
  { key: 'site.social.github', label: 'GitHub URL', group: 'social', type: 'url', defaultValue: '' },
  { key: 'site.analytics.ga_id', label: 'Google Analytics ID', group: 'social', type: 'text', defaultValue: '' },

  // ─── GA4 (Dashboard) ───────────────────────────────────────────────────────
  {
    key: 'ga4.propertyId',
    label: 'GA4 Property ID',
    description: 'Found in GA4 Admin > Property Settings > Property ID',
    group: 'ga4',
    type: 'text',
    defaultValue: '',
  },
  {
    key: 'ga4.serviceAccountJson',
    label: 'Service Account JSON',
    description: 'Paste the full JSON key file contents from Google Cloud Console.',
    group: 'ga4',
    type: 'json',
    defaultValue: '',
  },

  // ─── Reading ────────────────────────────────────────────────────────────────
  { key: 'site.posts_per_page', label: 'Posts per page', group: 'reading', type: 'number', defaultValue: 10 },
  { key: 'site.allow_registration', label: 'Allow user registration', group: 'reading', type: 'boolean', defaultValue: true },
];
