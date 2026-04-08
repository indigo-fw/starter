import './AppFooter.css';

/**
 * AppFooter — site footer with column grid, links, and copyright.
 *
 * Accepts children for the footer content (grid columns, bottom bar).
 * Wraps in .app-footer with an .app-container for width constraint.
 *
 * @example
 * <AppFooter>
 *   <div className="app-footer-grid">...</div>
 *   <div className="app-footer-bottom">...</div>
 * </AppFooter>
 */
export function AppFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="app-footer">
      <div className="app-container py-8">
        {children}
      </div>
    </footer>
  );
}
