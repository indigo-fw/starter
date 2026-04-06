import { registerEmailListProvider } from '@/core/lib/email-list/index';

/**
 * Register available email list providers.
 * The active provider is selected via EMAIL_LIST_PROVIDER env var.
 */

if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_LIST_ID) {
  registerEmailListProvider('mailchimp', () => {
    // Lazy-loaded to avoid importing when not needed
    const mod = require('@/core/lib/email-list/mailchimp') as typeof import('@/core/lib/email-list/mailchimp'); // eslint-disable-line @typescript-eslint/no-require-imports
    return new mod.MailchimpProvider();
  });
}

if (process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID) {
  registerEmailListProvider('brevo', () => {
    const mod = require('@/core/lib/email-list/brevo') as typeof import('@/core/lib/email-list/brevo'); // eslint-disable-line @typescript-eslint/no-require-imports
    return new mod.BrevoProvider();
  });
}
