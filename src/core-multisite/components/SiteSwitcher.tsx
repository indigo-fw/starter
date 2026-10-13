'use client';

import { useRef, useState } from 'react';

import { ChevronDown, Globe } from 'lucide-react';

import { useSitesApi, useSitesUtils } from '@/core-multisite/hooks/useSitesApi';
import { useCloseOnClickOutside } from '@/core/hooks/useCloseOnClickOutside';
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

  const sites = useSitesApi();
  const { data: siteList } = sites.list.useQuery();
  const setActive = sites.setActive.useMutation();
  const utils = useSitesUtils();

  useCloseOnClickOutside(ref, () => setOpen(false), { enabled: open });

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
        className={cn(
          'dash-rail-btn flex w-full items-center gap-1 px-2 py-1.5 text-xs'
        )}
        title={__('Switch site')}
      >
        <Globe size={16} />
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="card absolute top-0 left-full z-50 ml-1 w-56 p-1 shadow-lg">
          {siteList.map((site) => (
            <button
              key={site.id}
              onClick={() => handleSwitch(site.id)}
              className="dash-sidebar-link w-full px-3 py-2 text-left text-xs"
            >
              {site.name}
              {site.isNetworkAdmin && (
                <span className="ml-1.5 text-[10px] text-(--text-muted)">
                  ({__('Network')})
                </span>
              )}
            </button>
          ))}
          {networkAdminHref && (
            <>
              <hr className="my-1 border-(--border-primary)" />
              <a
                href={networkAdminHref}
                className="dash-sidebar-link flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs"
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
