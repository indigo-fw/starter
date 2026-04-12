'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { cn } from '@/lib/utils';

interface SiteSwitcherProps {
  /** Href for network admin dashboard (superadmin only) */
  networkAdminHref?: string;
}

/**
 * Site switcher dropdown for the dashboard.
 * Shows sites the current user has access to (superadmin sees all).
 * Selecting a site scopes all dashboard operations to that site.
 */
export function SiteSwitcher({ networkAdminHref }: SiteSwitcherProps) {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Router registered via module sync — type exists at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = (trpc as any).sites;
  const { data: siteList } = sites.list.useQuery() as { data: { id: string; name: string; slug: string; isNetworkAdmin: boolean }[] | undefined };
  const setActive = sites.setActive.useMutation() as { mutateAsync: (input: { siteId: string | null }) => Promise<unknown> };
  const utils = trpc.useUtils();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!siteList?.length) return null;

  const handleSwitch = async (siteId: string | null) => {
    await setActive.mutateAsync({ siteId });
    // Persist active site in cookie (proxy + API reads this to resolve site scope)
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    if (siteId) {
      document.cookie = `active-site=${siteId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
    } else {
      document.cookie = `active-site=; path=/; max-age=0${secure}`;
    }
    utils.invalidate();
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn('dash-rail-btn flex items-center gap-1 w-full px-2 py-1.5 text-xs')}
        title={__('Switch site')}
      >
        <Globe size={16} />
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-1 w-56 card p-1 shadow-lg z-50">
          {siteList.map((site) => (
            <button
              key={site.id}
              onClick={() => handleSwitch(site.id)}
              className="dash-sidebar-link w-full text-left text-xs px-3 py-2"
            >
              {site.name}
              {site.isNetworkAdmin && (
                <span className="ml-1.5 text-[10px] text-(--text-muted)">({__('Network')})</span>
              )}
            </button>
          ))}
          {networkAdminHref && (
            <>
              <hr className="my-1 border-(--border-primary)" />
              <a
                href={networkAdminHref}
                className="dash-sidebar-link flex items-center gap-1.5 w-full text-left text-xs px-3 py-2"
              >
                <Globe size={14} />
                {__('Network Admin')}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
