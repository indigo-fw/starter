'use client';

import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Plus } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/translations';
import { cn } from '@/lib/utils';

interface OrgSwitcherProps {
  manageOrgsHref?: string;
}

export function OrgSwitcher({ manageOrgsHref }: OrgSwitcherProps) {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: orgs } = trpc.organizations.list.useQuery();
  const setActive = trpc.organizations.setActive.useMutation();
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

  if (!orgs?.length) return null;

  const handleSwitch = async (orgId: string | null) => {
    await setActive.mutateAsync({ organizationId: orgId });
    utils.invalidate();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn('dash-rail-btn flex items-center gap-1 w-full px-2 py-1.5 text-xs')}
        title={__('Switch organization')}
      >
        <Building2 size={16} />
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-1 w-56 card p-1 shadow-lg z-50">
          <button
            onClick={() => handleSwitch(null)}
            className="dash-sidebar-link w-full text-left text-xs px-3 py-2"
          >
            {__('Personal')}
          </button>
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onClick={() => handleSwitch(org.orgId)}
              className="dash-sidebar-link w-full text-left text-xs px-3 py-2"
            >
              {org.orgName}
            </button>
          ))}
          {manageOrgsHref && (
            <>
              <hr className="my-1 border-(--border-primary)" />
              <a
                href={manageOrgsHref}
                className="dash-sidebar-link flex items-center gap-1.5 w-full text-left text-xs px-3 py-2"
              >
                <Plus size={14} />
                {__('Manage organizations')}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
