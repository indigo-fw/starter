import './AppNav.css';

/**
 * AppNav — standard horizontal nav for the app toolbar.
 *
 * Renders logo, nav links, spacer, and action buttons inside .app-toolbar.
 * Swap this component for AppRailNav or AppCompactNav in different layouts.
 *
 * @example
 * <AppHeader>
 *   <AppNav logo={...} nav={...} actions={...} />
 * </AppHeader>
 */
export function AppNav({
  logo,
  nav,
  actions,
  leading,
}: {
  /** Logo element (typically a Link with .app-logo) */
  logo: React.ReactNode;
  /** Nav links (typically a <nav> with .app-nav) */
  nav?: React.ReactNode;
  /** Right-side action buttons */
  actions?: React.ReactNode;
  /** Optional leading element before logo (e.g., sidebar toggle) */
  leading?: React.ReactNode;
}) {
  return (
    <>
      {leading}
      {logo}
      {nav}
      <div className="app-spacer" />
      {actions && <div className="app-actions">{actions}</div>}
    </>
  );
}
