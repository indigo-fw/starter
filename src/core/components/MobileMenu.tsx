'use client';

import { useState, useEffect, useCallback } from 'react';
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

export function MobileMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        className="header-icon-btn sm:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      <div
        className={cn('mobile-overlay transition-opacity duration-200', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={close}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className={cn('mobile-drawer transition-transform duration-200', open ? 'translate-x-0' : 'translate-x-full')}
      >
        <div className="mobile-drawer-header">
          <span className="text-sm font-semibold text-(--text-primary)">Menu</span>
          <button
            type="button"
            onClick={close}
            className="header-icon-btn"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {items.map((item) => (
            <a
              key={item.url}
              href={item.url}
              className={cn(
                'mobile-drawer-link',
                pathname === item.url && 'mobile-drawer-link-active'
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
