/**
 * Email engine — barrel exports.
 *
 * Projects wire branding + template overrides via `setEmailDeps()`.
 */

// DI
export { setEmailDeps, getEmailDeps } from './deps';
export type { EmailDeps, EmailSendOptions } from './deps';

// Template engine
export type { EmailBranding } from './template';
export { renderTemplate, escapeHtml, replacePlaceholders, loadTemplateFile } from './template';

// Transport
export { sendEmail, isValidEmail, getTransport, FROM_EMAIL } from './transport';

// Queue + worker
export { enqueueTemplateEmail, enqueueEmail, startEmailWorker } from './queue';
