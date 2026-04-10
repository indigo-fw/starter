import type { OptionDefinition } from '@/core/config/options';
import { siteDefaults } from '@/config/site';

export type { OptionDefinition } from '@/core/config/options';

export const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  company: 'Company Info',
  branding: 'Branding',
  email: 'Email Branding',
  social: 'Social & Analytics',
  ga4: 'Google Analytics 4 (Dashboard)',
  reading: 'Reading',
  chat: 'Chat & AI',
};

export const OPTION_REGISTRY: OptionDefinition[] = [
  // ─── General ────────────────────────────────────────────────────────────────
  { key: 'site.name', label: 'Site Name', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.tagline', label: 'Tagline', group: 'general', type: 'text', defaultValue: '' },
  { key: 'site.description', label: 'Description', group: 'general', type: 'textarea', defaultValue: '' },
  { key: 'site.url', label: 'Site URL', group: 'general', type: 'url', defaultValue: '' },

  // ─── Company Info (used in legal pages via [[VAR]] content variables) ────────
  // Empty defaults = not stored in DB until explicitly set.
  // Placeholders show site.ts fallback values. DB value overrides site.ts when set.
  { key: 'company.name', label: 'Company Legal Name', description: 'Used as [[COMPANY_NAME]] in content. Falls back to site.ts when empty.', group: 'company', type: 'text', defaultValue: '', placeholder: siteDefaults.companyName },
  { key: 'company.address', label: 'Company Address', description: 'Used as [[COMPANY_ADDRESS]] in content', group: 'company', type: 'text', defaultValue: '', placeholder: siteDefaults.companyAddress },
  { key: 'company.id', label: 'Registration Number', description: 'Used as [[COMPANY_ID]] in content', group: 'company', type: 'text', defaultValue: '', placeholder: siteDefaults.companyId },
  { key: 'company.jurisdiction', label: 'Governing Law Jurisdiction', description: 'Used as [[COMPANY_JURISDICTION]] in content', group: 'company', type: 'text', defaultValue: '', placeholder: siteDefaults.companyJurisdiction },
  { key: 'company.contact_email', label: 'Contact Email', description: 'Used as [[CONTACT_EMAIL]] in content', group: 'company', type: 'text', defaultValue: '', placeholder: siteDefaults.contactEmail },

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

  // ─── Chat & AI ─────────────────────────────────────────────────────────────
  { key: 'chat.moderation.enabled', label: 'Enable content moderation', group: 'chat', type: 'boolean', defaultValue: true },
  { key: 'chat.moderation.action', label: 'Moderation action', description: 'block = reject message, flag = allow but mark for review', group: 'chat', type: 'text', defaultValue: 'block' },
  {
    key: 'chat.moderation.keywords',
    label: 'Moderation keywords',
    description: 'JSON array of blocked keywords. Edit carefully.',
    group: 'chat',
    type: 'json',
    defaultValue: JSON.stringify([
      'kill', 'murder', 'bomb', 'terrorist', 'suicide',
      'child abuse', 'child porn', 'underage',
      'nazi', 'white supremacy', 'ethnic cleansing',
    ]),
  },
  { key: 'chat.tokens.text_message', label: 'Token cost per text message', group: 'chat', type: 'number', defaultValue: 1 },
  { key: 'chat.tokens.image_generation', label: 'Token cost per image', group: 'chat', type: 'number', defaultValue: 10 },
  { key: 'chat.tokens.video_generation', label: 'Token cost per video (base per second)', group: 'chat', type: 'number', defaultValue: 8 },
  { key: 'chat.rate_limit.messages_per_minute', label: 'Rate limit (messages per minute)', group: 'chat', type: 'number', defaultValue: 20 },
  { key: 'chat.rate_limit.anonymous_per_conversation', label: 'Anonymous: messages per conversation', group: 'chat', type: 'number', defaultValue: 5 },
  { key: 'chat.rate_limit.anonymous_lifetime', label: 'Anonymous: lifetime messages', group: 'chat', type: 'number', defaultValue: 20 },
  { key: 'chat.rate_limit.registered_window_hours', label: 'Registered: rate limit window (hours)', group: 'chat', type: 'number', defaultValue: 24 },
  { key: 'chat.rate_limit.registered_messages', label: 'Registered: messages per window', group: 'chat', type: 'number', defaultValue: 50 },
  { key: 'chat.tokens.voice_call_per_minute', label: 'Token cost per voice call minute', group: 'chat', type: 'number', defaultValue: 50 },
];
