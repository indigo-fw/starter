'use client';

import { useAdminTranslations } from '@/lib/translations';

/**
 * Admin chat overview — placeholder for stats/config.
 */
export default function ChatSettingsPage() {
  const __ = useAdminTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Chat Settings')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">
          {__('Manage AI chat characters and configuration.')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a
          href="/dashboard/settings/chat/characters"
          className="block p-4 rounded-xl border border-(--border-primary) hover:border-brand-500/50 hover:bg-brand-500/5 transition-all"
        >
          <h3 className="font-semibold text-(--text-primary)">{__('Characters')}</h3>
          <p className="text-sm text-(--text-tertiary) mt-1">
            {__('Create and manage AI chat personas.')}
          </p>
        </a>
      </div>
    </div>
  );
}
