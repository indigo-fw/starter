'use client';

import { useConsentSafe } from '../../lib/consent/context';
import { useBlankTranslations } from '../../lib/i18n/translations';

interface CookieSettingsButtonProps {
  /** Override the label. Defaults to "Cookie settings". */
  label?: string;
  /** Override className for theming (defaults to footer-link styling). */
  className?: string;
}

/**
 * Reopens the cookie consent banner so the user can review or withdraw
 * their previous choice. Drop into a footer / cookie policy page.
 *
 * GDPR Art. 7(3) — withdrawal must be as easy as giving consent.
 *
 * If <ConsentProvider> isn't in the tree (e.g. on a layout that opted out),
 * renders nothing rather than crashing.
 */
export function CookieSettingsButton({ label, className }: CookieSettingsButtonProps) {
  const ctx = useConsentSafe();
  const __ = useBlankTranslations();

  if (!ctx) return null;

  return (
    <button
      type="button"
      className={className ?? 'cookie-settings-button'}
      onClick={ctx.openSettings}
    >
      {label ?? __('Cookie settings')}
    </button>
  );
}
