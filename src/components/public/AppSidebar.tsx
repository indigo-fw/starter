'use client';

import './AppSidebar.css';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Link } from '@/components/Link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AppNavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

// ── Shared state via context ──────────────────────────────────
const SidebarContext = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>({ open: false, toggle: () => {}, close: () => {} });

export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change (adjust state during render — React docs pattern)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <SidebarContext.Provider value={{ open, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

/** Hamburger toggle button — place inside the navbar. */
export function AppSidebarToggle({ alwaysOpen = false }: { alwaysOpen?: boolean }) {
  const { open, toggle } = useContext(SidebarContext);

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn('icon-btn', alwaysOpen && 'xl:hidden')}
      aria-label={open ? 'Close menu' : 'Open menu'}
    >
      {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );
}

/** Sidebar drawer + backdrop — place as a sibling of header and main. */
export function AppSidebarDrawer({
  items,
  alwaysOpen = false,
}: {
  items: AppNavItem[];
  alwaysOpen?: boolean;
}) {
  const { open, close } = useContext(SidebarContext);
  const pathname = usePathname();
  const isVisible = alwaysOpen || open;

  return (
    <>
      {open && (
        <div
          className={cn('app-sidebar-backdrop', alwaysOpen && 'xl:hidden')}
          onClick={close}
        />
      )}

      <aside
        className={cn('app-sidebar', alwaysOpen && 'xl:translate-x-0 xl:transition-none')}
        data-visible={isVisible}
      >
        <nav className="app-sidebar-nav">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('app-sidebar-link', isActive && 'app-sidebar-link-active')}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
