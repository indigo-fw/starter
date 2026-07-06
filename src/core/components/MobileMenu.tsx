'use client';

import './MobileMenu.css';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  url: string;
}

interface Props {
  items: NavItem[];
}

// Stable no-op subscription for useSyncExternalStore hydration detection.
const emptySubscribe = () => () => {};

export function MobileMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Portal target requires `document` — only available after hydration.
  // useSyncExternalStore's server/client snapshot split is the render-safe
  // way to detect hydration (no setState-in-effect).
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const close = useCallback(() => setOpen(false), []);

  // Close on route change (adjust state during render — React docs pattern)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="icon-btn sm:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Portal the overlay + drawer to <body> to escape the header's
          containing block. .app-header has `backdrop-filter: blur(...)`, and
          any ancestor with backdrop-filter / transform / filter / perspective
          re-roots position:fixed to that ancestor instead of the viewport —
          so top:0/bottom:0 would span the 56px header height, not 100vh,
          shrinking the drawer to a tiny scrolling strip. */}
      {mounted && createPortal(
        <>
          <div
            className={cn('app-mobile-overlay transition-opacity duration-200', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
            onClick={close}
            aria-hidden
          />

          <div
            className={cn('app-mobile-drawer transition-transform duration-200', open ? 'translate-x-0' : 'translate-x-full')}
          >
            <div className="app-mobile-drawer-header">
              <span className="text-sm font-semibold text-(--text-primary)">Menu</span>
              <button
                type="button"
                onClick={close}
                className="icon-btn"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="app-mobile-drawer-nav">
              {items.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  className={cn(
                    'app-mobile-drawer-link',
                    pathname === item.url && 'app-mobile-drawer-link-active'
                  )}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
