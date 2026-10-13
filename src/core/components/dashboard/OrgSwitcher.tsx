'use client';

import { useRef, useState } from 'react';

import { Building2, ChevronDown, Plus } from 'lucide-react';

import { useCloseOnClickOutside } from '@/core/hooks/useCloseOnClickOutside';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { trpc } from '@/lib/trpc/client';
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

  useCloseOnClickOutside(ref, () => setOpen(false), { enabled: open });

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
        className={cn(
          'dash-rail-btn flex w-full items-center gap-1 px-2 py-1.5 text-xs'
        )}
        title={__('Switch organization')}
      >
        <Building2 size={16} />
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="card absolute top-0 left-full z-50 ml-1 w-56 p-1 shadow-lg">
          <button
            onClick={() => handleSwitch(null)}
            className="dash-sidebar-link w-full px-3 py-2 text-left text-xs"
          >
            {__('Personal')}
          </button>
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onClick={() => handleSwitch(org.orgId)}
              className="dash-sidebar-link w-full px-3 py-2 text-left text-xs"
            >
              {org.orgName}
            </button>
          ))}
          {manageOrgsHref && (
            <>
              <hr className="my-1 border-(--border-primary)" />
              <a
                href={manageOrgsHref}
                className="dash-sidebar-link flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs"
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
