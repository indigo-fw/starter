'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { MenuBuilder } from '@/core/components/MenuBuilder';

interface Props {
  params: Promise<{ id: string }>;
}

export default function MenuEditPage({ params }: Props) {
  const { id } = use(params);
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const menuQuery = trpc.menus.get.useQuery({ id });
  const [name, setName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);

  if (menuQuery.data && !nameLoaded) {
    setName(menuQuery.data.name);
    setNameLoaded(true);
  }

  const updateMenu = trpc.menus.update.useMutation({
    onSuccess: () => {
      toast.success(__('Menu updated'));
      utils.menus.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (menuQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="menu-edit-header-left flex items-center gap-3">
            <Link
              href={adminPanel.menus}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {__('Edit Menu')}
            </h1>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner menu-edit-page">
      {/* Menu name */}
      <div className="menu-edit-name-card mt-4 card p-4">
        <div className="menu-edit-name-row flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-(--border-primary) px-3 py-2 text-sm font-medium"
            placeholder={__('Menu name')}
          />
          <button
            onClick={() => updateMenu.mutate({ id, name })}
            disabled={updateMenu.isPending}
            className="btn btn-secondary disabled:opacity-50"
          >
            {updateMenu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {__('Update Name')}
          </button>
        </div>
      </div>

      {/* Menu items builder */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-(--text-primary) mb-4">{__('Menu Items')}</h2>
        <MenuBuilder menuId={id} />
      </div>
    </div></main>
    </>
  );
}
