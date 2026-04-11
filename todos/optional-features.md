# Optional Features — Module-Worthy, Not Core

These features were evaluated during the core infrastructure audit (2026-04) and determined to be **not universal enough** for core. Each one is useful but project-specific or heavy enough to warrant being a standalone module, a project-layer addition, or a third-party integration.

## Security / Auth

### 2FA / MFA
Better Auth already has a `twoFactor` plugin — projects enable it in `src/lib/auth.ts` by adding the plugin. No framework code needed.

**If building as module:**
- TOTP (Google Authenticator, Authy) — Better Auth plugin handles this
- SMS fallback — needs Twilio/Vonage provider
- Recovery codes — generate on enable, hash+store, single-use
- Remember device (30 days) — cookie + DB token
- Admin enforcement — "require 2FA for admin role" policy

**Effort:** Low if using Better Auth plugin. Medium if building custom.

### Admin Impersonation (Act As User)
Allows admins to log in as another user for debugging. Useful for support teams but not universal.

**If building:**
- `POST /api/admin/impersonate/:userId` — creates a shadow session, stores original admin ID
- UI indicator bar: "You are viewing as user@example.com — Exit"
- Audit log every impersonation start/end
- Restrict to superadmin only
- Auto-expire after 30 minutes
- Disable destructive actions (password change, account deletion) while impersonating

**Effort:** Medium. Needs session manipulation, UI bar, audit trail.

### Password Policy Enforcer
Better Auth handles password hashing. Policy (min length, complexity) is project config.

**If building:**
- `PasswordPolicy` type: `{ minLength, requireUppercase, requireNumber, requireSpecial, maxAge? }`
- `validatePassword(password, policy)` — returns `{ valid, errors[] }`
- `<PasswordStrengthMeter>` component — color bar (weak/fair/strong)
- Hook into Better Auth's `emailAndPassword` config
- Optional: breached password check against HaveIBeenPwned API (k-anonymity)

**Effort:** Low for basic policy. Medium with strength meter + breach check.

## Progressive Web App

### PWA / Service Worker
Most SaaS apps don't need offline support. The ones that do (field service, note-taking) have very specific caching strategies.

**If building:**
- `manifest.json` with app name, icons, theme color, display mode
- Service worker with `next-pwa` or custom Workbox config
- Cache strategy: network-first for API, cache-first for static assets
- Offline fallback page
- Install prompt component (`<InstallPWA>`)
- Push notifications via Web Push API + VAPID keys

**Effort:** Medium. `next-pwa` does heavy lifting but needs tuning per project.

## Monitoring / Performance

### Web Vitals Tracking
One line to add Vercel Analytics, or a small integration with any RUM tool. Not framework code.

**If building custom:**
- `reportWebVitals()` in `src/app/layout.tsx` — sends CLS, FID, LCP, FCP, TTFB to analytics endpoint
- Dashboard widget showing Web Vitals trends
- Alert thresholds (e.g., LCP > 2.5s)
- Integrations: Vercel Analytics, Datadog RUM, Sentry Performance, custom endpoint

**Effort:** Low for basic reporting. Medium for dashboard + alerts.

### Error Tracking Integration
Sentry/Axiom wrapper. Thin enough for core but projects vary in which service they use.

**If building:**
- `captureException(error, context)` — provider-agnostic wrapper
- Provider registry: Sentry, Axiom, Datadog, custom HTTP endpoint
- `src/core/lib/infra/error-tracking.ts` with `setErrorTrackingProvider()`
- Auto-capture in: tRPC error handler, API route wrapper, queue worker error handler
- Source maps upload in CI

**Effort:** Low for the wrapper. Medium for full integration + source maps.

## UX / Engagement

### Onboarding / Setup Wizard
Every app's onboarding is different. The wizard structure could be core, but the steps are always project-specific.

**If building as core utility:**
- `OnboardingStep` type: `{ id, title, description, component, isComplete }`
- `registerOnboardingStep(step)` — modules contribute steps
- `<OnboardingWizard steps={[...]} />` — stepper UI with progress bar
- `useOnboarding()` hook — track completion, skip, resume
- Persist progress in user preferences
- Auto-dismiss after all steps complete

**If building as module (`core-onboarding`):**
- DB-backed step completion tracking
- Admin-configurable step ordering
- Conditional steps (show step X only if user has role Y)
- Analytics: funnel tracking, drop-off rates

**Effort:** Medium for core utility. High for full module.

### In-App Changelog / Announcements
A CMS content type + simple widget. Could use the existing CMS posts system with a dedicated `changelog` post type.

**If building:**
- Content type: `changelog` in `src/config/cms.ts` (title, body, version, publishedAt)
- `<ChangelogWidget>` — bell icon or "What's New" badge with unread count
- Track last-seen version per user (user preferences)
- SlideOver panel showing entries reverse-chronologically
- Optional: external feed (fetch from GitHub releases API)
- Admin: write changelog entries in the CMS editor

**Effort:** Low — mostly config + one component. The CMS already handles the content.

### Breadcrumbs Component
Useful but very project-specific in structure. The URL → breadcrumb mapping differs per project.

**If building:**
- `<Breadcrumbs items={[{ label, href }]} />` — simple render component
- `useBreadcrumbs()` hook — auto-generate from Next.js route segments
- Config: `breadcrumbConfig` map from route pattern → label
- Support for dynamic segments: `/blog/[slug]` → "Blog > Post Title"
- Structured data: auto-inject `BreadcrumbList` JSON-LD

**Effort:** Low for static component. Medium for auto-generation from routes.

## Data / Export

### PDF Export
Heavy dependency (puppeteer, jsPDF, or @react-pdf/renderer). Very project-specific in what gets exported.

**If building as module (`core-export`):**
- Provider pattern: `registerExportProvider('pdf', PdfProvider)`
- Puppeteer-based: render HTML template → PDF (server-side)
- React PDF: `@react-pdf/renderer` for structured documents (invoices, reports)
- Client-side: `jsPDF` for simple tables/text
- Queue-based generation for large documents
- Templates: invoice, report, certificate (project provides template)

**Effort:** High. Multiple providers, template system, queue for large docs.

## Misc

### Print Styles
Most web apps don't need print CSS. The ones that do (invoices, reports) have very specific layouts.

**If building:**
- `@media print` utilities in `src/core/styles/frontend/print.css`
- `.print-only` / `.no-print` utility classes
- Print-friendly table styles
- Page break helpers: `.page-break-before`, `.page-break-after`
- `<PrintButton>` component that triggers `window.print()`

**Effort:** Low. Just CSS utilities + one component.

### Back-to-Top Button
Trivial. 10 lines of code:

```tsx
'use client';
import { useEffect, useState } from 'react';

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 btn btn-primary rounded-full p-3 shadow-lg">
      ↑
    </button>
  );
}
```

Not worth core surface area. Copy-paste into project if needed.

### Copy to Clipboard
5 lines:

```tsx
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
```

Not framework code. Project adds if needed.

---

## Priority If Revisiting

| Priority | Feature | Recommended approach |
|----------|---------|---------------------|
| High | 2FA/MFA | Better Auth `twoFactor` plugin (already available) |
| High | Error tracking | Core wrapper with provider registry |
| Medium | Impersonation | Project-layer or module |
| Medium | Changelog | CMS content type + widget component |
| Medium | Breadcrumbs | Core component with auto-generation hook |
| Low | Password policy | Better Auth config + strength meter component |
| Low | PWA | `next-pwa` integration guide in docs |
| Low | PDF export | Module (`core-export`) |
| Low | Web Vitals | One-line integration, not framework code |
| Low | Print styles | CSS file, copy if needed |
| Skip | Back-to-top | Copy-paste, not core |
| Skip | Copy to clipboard | 5 lines, not core |
