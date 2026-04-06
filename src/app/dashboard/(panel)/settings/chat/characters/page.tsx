'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Admin character list — CRUD for AI chat personas.
 */
export default function CharactersPage() {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.characters.list.useQuery({ includeInactive: true });
  const deleteMutation = trpc.characters.delete.useMutation();
  const utils = trpc.useUtils();

  function handleDelete(id: string) {
    if (!confirm(__('Are you sure you want to delete this character?'))) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => utils.characters.list.invalidate(),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Characters')}</h1>
          <p className="text-sm text-(--text-secondary) mt-1">
            {__('AI personas that users can chat with.')}
          </p>
        </div>
        <a
          href="/dashboard/settings/chat/characters/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          <Plus size={16} />
          {__('New Character')}
        </a>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
        </div>
      ) : !data?.results.length ? (
        <div className="text-center py-12 text-sm text-(--text-tertiary)">
          {__('No characters yet. Create your first AI persona.')}
        </div>
      ) : (
        <div className="border border-(--border-primary) rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border-primary) bg-(--surface-secondary)">
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Name')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Slug')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Status')}</th>
                <th className="px-4 py-3 text-right font-medium text-(--text-secondary)">{__('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((char) => (
                <tr key={char.id} className="border-b border-(--border-primary) last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-medium">{char.name[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-(--text-primary)">{char.name}</div>
                        {char.tagline && (
                          <div className="text-xs text-(--text-tertiary) truncate max-w-[200px]">{char.tagline}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-(--text-secondary) font-mono text-xs">{char.slug}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      char.isActive
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-(--surface-secondary) text-(--text-tertiary)',
                    )}>
                      {char.isActive ? __('Active') : __('Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/dashboard/settings/chat/characters/${char.id}`}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) transition-colors"
                      >
                        <Pencil size={14} />
                      </a>
                      <button
                        onClick={() => handleDelete(char.id)}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
