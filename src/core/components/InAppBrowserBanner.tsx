'use client';

import { useState } from 'react';

import { ExternalLink, X } from 'lucide-react';

import { useHydrated } from '@/core/hooks/useHydrated';
import {
  type InAppBrowser,
  detectInAppBrowser,
  detectMobilePlatform,
  getOpenInBrowserUrl,
  isBotUserAgent,
} from '@/core/lib/browser-detection';
import {
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/core/lib/storage/local-storage';
import { useBlankTranslations } from '@/lib/translations';

const STORAGE_KEY = 'in-app-browser-banner-dismissed';

const APP_NAMES: Record<InAppBrowser, string> = {
  facebook: 'Facebook',
  messenger: 'Messenger',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

/**
 * Nudges users browsing inside a social app's webview to open the page in a
 * real browser: Google OAuth refuses those webviews (`disallowed_useragent`),
 * so "Continue with Google" would otherwise fail with no explanation.
 * Renders nothing on the server and on the hydration pass — the UA is only
 * known client-side.
 */
export function InAppBrowserBanner() {
  const __ = useBlankTranslations();
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);

  if (!hydrated || dismissed) return null;

  const ua = navigator.userAgent;
  if (isBotUserAgent(ua)) return null;
  const app = detectInAppBrowser(ua);
  if (!app) return null;
  if (getLocalStorageItem(STORAGE_KEY) === '1') return null;

  const platform = detectMobilePlatform(ua);
  const openUrl = getOpenInBrowserUrl(ua, window.location.href);

  const dismiss = () => {
    setLocalStorageItem(STORAGE_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="in-app-browser-banner flex items-start gap-3 border-b border-(--border-primary) bg-(--surface-secondary) px-4 py-2 text-sm"
    >
      <div className="flex-1 space-y-1">
        <p className="text-(--text-secondary)">
          {__(
            'You are viewing this page inside {app}. Sign-in with Google and some features only work in your browser.',
            {
              app: APP_NAMES[app],
            }
          )}
        </p>
        {openUrl ? (
          <a
            href={openUrl}
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {__('Open in browser')}
          </a>
        ) : (
          <p className="text-(--text-muted)">
            {platform === 'ios'
              ? __(
                  'Tap the ··· menu and choose "Open in Safari" or "Open in browser".'
                )
              : __('Use the ··· menu and choose "Open in browser".')}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded p-0.5 text-(--text-muted) transition-colors hover:text-(--text-secondary)"
        aria-label={__('Dismiss')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
