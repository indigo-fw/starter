'use client';

import dynamic from 'next/dynamic';

// Lazy-loaded global UI that doesn't paint on first load. Their JS
// chunks load after hydration so the initial-interaction main thread
// stays free (INP win on first click). All wrapped components are
// either modals (closed = render null) or `position: fixed`, so
// lazy-mounting cannot cause layout shift.
//
// CookieConsent is opt-in via the `cookieConsent` prop because it
// requires a `<ConsentProvider>` ancestor — only the public layout
// has one; layouts like showcase don't and would crash on render.
const AuthDialogs = dynamic(
  () => import('./AuthDialogs').then((m) => ({ default: m.AuthDialogs })),
  { ssr: false }
);
const CookieConsent = dynamic(
  () =>
    import('@/core/components/consent/CookieConsent').then((m) => ({
      default: m.CookieConsent,
    })),
  { ssr: false }
);

interface Props {
  /** Renders <CookieConsent>. Requires ConsentProvider in the tree. */
  cookieConsent?: { privacyPolicyUrl?: string } | false;
}

export function DeferredGlobalUI({ cookieConsent }: Props) {
  return (
    <>
      <AuthDialogs />
      {cookieConsent !== false && cookieConsent && (
        <CookieConsent privacyPolicyUrl={cookieConsent.privacyPolicyUrl} />
      )}
    </>
  );
}
