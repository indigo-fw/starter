'use client';

import { useEffect, useRef, useState } from 'react';
import { useConsent } from '../../lib/consent/context';
import { useBlankTranslations } from '../../lib/i18n/translations';
import './CookieConsent.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CookieConsentProps {
  /** URL to privacy policy page. */
  privacyPolicyUrl?: string;
  /** URL to cookie policy page (per-cookie purposes, durations, controllers). */
  cookiePolicyUrl?: string;
  /** Position on screen. */
  position?: 'bottom' | 'bottom-left' | 'bottom-right';
  /**
   * Labels for custom categories. Built-in categories (necessary, analytics, marketing)
   * have default labels. Custom categories need labels here.
   * Key = category name, value = { label, description }.
   */
  categoryLabels?: Record<string, { label: string; description: string }>;
}

// ---------------------------------------------------------------------------
// Default labels for built-in categories
// ---------------------------------------------------------------------------

const BUILTIN_LABELS: Record<string, { label: string; description: string }> = {
  necessary: {
    label: 'Necessary',
    description: 'Essential for the website to function. Cannot be disabled.',
  },
  analytics: {
    label: 'Analytics',
    description: 'Help us understand how visitors interact with the website.',
  },
  marketing: {
    label: 'Marketing',
    description: 'Used to deliver relevant advertisements and track campaigns.',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CookieConsent({
  privacyPolicyUrl,
  cookiePolicyUrl,
  position = 'bottom',
  categoryLabels,
}: CookieConsentProps) {
  const {
    isOpen,
    hasConsented,
    consent,
    categories,
    rejectNonEssential,
    acceptAll,
    updateConsent,
    closeSettings,
  } = useConsent();

  const __ = useBlankTranslations();

  // When the banner appears for an already-consented user (i.e. re-opened
  // via the footer link), drop them straight into the detailed view so they
  // can adjust per-category — the simple "accept/reject all" wouldn't reflect
  // their current granular state.
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState(consent);

  // Sync the draft to whatever the global consent is whenever the banner
  // (re-)opens. Avoids stale values if the user closed → settings changed
  // elsewhere → reopen. Adjust-during-render (React docs pattern): the reset
  // lands in the same render pass, so the banner never paints a stale draft.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setDraft(consent);
      setShowDetails(hasConsented);
    }
  }

  // Focus the first interactive control when the banner opens via openSettings
  // (i.e. user explicitly asked for it). On the first-visit appearance we
  // intentionally don't yank focus — sighted users find that jarring, and
  // aria-live below already announces the banner to screen readers.
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (isOpen && hasConsented) {
      firstButtonRef.current?.focus();
    }
  }, [isOpen, hasConsented]);

  if (!isOpen) return null;

  const allLabels = { ...BUILTIN_LABELS, ...categoryLabels };

  const handleSavePreferences = () => {
    updateConsent(draft);
  };

  const handleToggle = (category: string) => {
    if (category === 'necessary') return;
    setDraft((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div
      className={`cookie-consent cookie-consent--${position}`}
      role="region"
      aria-label={__('Cookie consent')}
      aria-live="polite"
    >
      {!showDetails ? (
        <div className="cookie-consent__simple">
          <div className="cookie-consent__text">
            <p className="cookie-consent__title">{__('We value your privacy')}</p>
            <p className="cookie-consent__description">
              {__(
                'We use cookies to provide essential site functionality and, with your consent, to analyse traffic and personalise content. You can change your choice at any time.',
              )}
              {(privacyPolicyUrl || cookiePolicyUrl) && <> </>}
              {privacyPolicyUrl && (
                <a href={privacyPolicyUrl} className="cookie-consent__link">
                  {__('Privacy Policy')}
                </a>
              )}
              {privacyPolicyUrl && cookiePolicyUrl && <> · </>}
              {cookiePolicyUrl && (
                <a href={cookiePolicyUrl} className="cookie-consent__link">
                  {__('Cookie Policy')}
                </a>
              )}
            </p>
          </div>
          <div className="cookie-consent__actions">
            <button
              ref={firstButtonRef}
              type="button"
              className="cookie-consent__btn cookie-consent__btn--secondary"
              onClick={rejectNonEssential}
            >
              {__('Reject All')}
            </button>
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--secondary"
              onClick={() => setShowDetails(true)}
            >
              {__('Customize')}
            </button>
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--primary"
              onClick={acceptAll}
            >
              {__('Accept All')}
            </button>
            {hasConsented && (
              <button
                type="button"
                className="cookie-consent__btn cookie-consent__btn--ghost"
                onClick={closeSettings}
                aria-label={__('Close cookie banner')}
              >
                {__('Close')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="cookie-consent__details">
          <p className="cookie-consent__title">{__('Cookie Preferences')}</p>
          <p className="cookie-consent__description">
            {__(
              'Choose which categories of cookies you allow. Necessary cookies are required for the site to function and cannot be disabled.',
            )}
          </p>
          <div className="cookie-consent__categories">
            {categories.map((category) => {
              const info = allLabels[category] ?? { label: category, description: '' };
              const isNecessary = category === 'necessary';
              return (
                <label key={category} className="cookie-consent__category">
                  <div className="cookie-consent__category-info">
                    <span className="cookie-consent__category-label">{__(info.label)}</span>
                    {info.description && (
                      <span className="cookie-consent__category-desc">{__(info.description)}</span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isNecessary ? true : (draft[category] ?? false)}
                    disabled={isNecessary}
                    onChange={() => handleToggle(category)}
                    className="cookie-consent__checkbox"
                    aria-label={__(info.label)}
                  />
                </label>
              );
            })}
          </div>
          <div className="cookie-consent__actions">
            <button
              ref={firstButtonRef}
              type="button"
              className="cookie-consent__btn cookie-consent__btn--secondary"
              onClick={rejectNonEssential}
            >
              {__('Reject All')}
            </button>
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--secondary"
              onClick={acceptAll}
            >
              {__('Accept All')}
            </button>
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--primary"
              onClick={handleSavePreferences}
            >
              {__('Save Preferences')}
            </button>
            {hasConsented && (
              <button
                type="button"
                className="cookie-consent__btn cookie-consent__btn--ghost"
                onClick={closeSettings}
                aria-label={__('Close cookie banner')}
              >
                {__('Close')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
