'use client';

import { useState } from 'react';
import { useConsent } from '../../lib/consent/context';
import { CONSENT_CATEGORIES } from '../../lib/consent/types';
import type { ConsentCategory } from '../../lib/consent/types';
import { useBlankTranslations } from '../../lib/i18n/translations';
import './CookieConsent.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CookieConsentProps {
  /** URL to privacy policy page */
  privacyPolicyUrl?: string;
  /** Which optional categories to show (default: analytics + marketing) */
  categories?: ConsentCategory[];
  /** Position on screen */
  position?: 'bottom' | 'bottom-left' | 'bottom-right';
}

// ---------------------------------------------------------------------------
// Category labels (translation keys)
// ---------------------------------------------------------------------------

const CATEGORY_KEYS: Record<ConsentCategory, { label: string; description: string }> = {
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
  categories = CONSENT_CATEGORIES.filter((c) => c !== 'necessary'),
  position = 'bottom',
}: CookieConsentProps) {
  const { hasConsented, consent, updateConsent, acceptAll, rejectNonEssential } = useConsent();
  const __ = useBlankTranslations();
  const [showDetails, setShowDetails] = useState(false);
  const [localState, setLocalState] = useState(consent);

  if (hasConsented) return null;

  const handleSavePreferences = () => {
    updateConsent(localState);
  };

  const handleToggle = (category: ConsentCategory) => {
    if (category === 'necessary') return;
    setLocalState((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className={`cookie-consent cookie-consent--${position}`} role="dialog" aria-label={__('Cookie consent')}>
      {!showDetails ? (
        <div className="cookie-consent__simple">
          <div className="cookie-consent__text">
            <p className="cookie-consent__title">{__('We use cookies')}</p>
            <p className="cookie-consent__description">
              {__('We use cookies to improve your experience.')}
              {privacyPolicyUrl && (
                <>
                  {' '}{__('Learn more in our')}{' '}
                  <a href={privacyPolicyUrl} className="cookie-consent__link">
                    {__('Privacy Policy')}
                  </a>.
                </>
              )}
            </p>
          </div>
          <div className="cookie-consent__actions">
            <button
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
          </div>
        </div>
      ) : (
        <div className="cookie-consent__details">
          <p className="cookie-consent__title">{__('Cookie Preferences')}</p>
          <div className="cookie-consent__categories">
            {(['necessary', ...categories] as ConsentCategory[]).map((category) => {
              const info = CATEGORY_KEYS[category];
              const isNecessary = category === 'necessary';
              return (
                <label key={category} className="cookie-consent__category">
                  <div className="cookie-consent__category-info">
                    <span className="cookie-consent__category-label">{__(info.label)}</span>
                    <span className="cookie-consent__category-desc">{__(info.description)}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isNecessary ? true : localState[category]}
                    disabled={isNecessary}
                    onChange={() => handleToggle(category)}
                    className="cookie-consent__checkbox"
                  />
                </label>
              );
            })}
          </div>
          <div className="cookie-consent__actions">
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--secondary"
              onClick={() => setShowDetails(false)}
            >
              {__('Back')}
            </button>
            <button
              type="button"
              className="cookie-consent__btn cookie-consent__btn--primary"
              onClick={handleSavePreferences}
            >
              {__('Save Preferences')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
