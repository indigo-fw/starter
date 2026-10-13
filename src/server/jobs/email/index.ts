/**
 * Project-specific email template names.
 *
 * The email engine lives in @/core/lib/email — import from there.
 * This file only holds the project-specific TemplateName type/list.
 */

export type TemplateName =
  | 'welcome'
  | 'verify-email'
  | 'password-reset'
  | 'invitation'
  | 'payment-failed'
  | 'subscription-activated'
  | 'subscription-expiring'
  | 'subscription-expired'
  | 'subscription-canceled'
  | 'order-confirmation'
  | 'order-shipped'
  | 'staff-alert'
  | 'gdpr-deletion'
  | 'support-ticket-new'
  | 'support-ticket-reply'
  | 'support-ticket-answer';

export const TEMPLATE_NAMES: TemplateName[] = [
  'welcome',
  'verify-email',
  'password-reset',
  'invitation',
  'payment-failed',
  'subscription-activated',
  'subscription-expiring',
  'subscription-expired',
  'order-confirmation',
  'order-shipped',
  'subscription-canceled',
  'staff-alert',
  'gdpr-deletion',
  'support-ticket-new',
  'support-ticket-reply',
  'support-ticket-answer',
];
