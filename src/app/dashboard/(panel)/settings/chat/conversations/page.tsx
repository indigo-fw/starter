'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Loader2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminConversationsPage() {
  const __ = useAdminTranslations();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = trpc.chatAdmin.conversationsList.useQuery({
    page,
    pageSize: 20,
    status: statusFilter ? statusFilter as 'active' | 'archived' | 'deleted' : undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Conversations')}</h1>
          <p className="text-sm text-(--text-secondary) mt-1">{__('Browse all chat conversations')}</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="select text-sm"
        >
          <option value="">{__('All statuses')}</option>
          <option value="active">{__('Active')}</option>
          <option value="archived">{__('Archived')}</option>
          <option value="deleted">{__('Deleted')}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>
      ) : !data?.results.length ? (
        <div className="text-center py-12 text-sm text-(--text-tertiary)">{__('No conversations found.')}</div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border-primary) bg-(--surface-secondary)">
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('User')}</th>
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Character')}</th>
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Messages')}</th>
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Tokens')}</th>
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Status')}</th>
                  <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Last Active')}</th>
                  <th className="px-4 py-3 text-right font-medium text-(--text-secondary)" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((conv) => (
                  <tr key={conv.id} className="border-b border-(--border-primary) last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-(--text-primary)">{conv.userName}</div>
                      <div className="text-xs text-(--text-tertiary)">{conv.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
                          {conv.characterAvatar ? (
                            <img src={conv.characterAvatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px]">{conv.characterName?.[0]}</span>
                          )}
                        </div>
                        {conv.characterName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--text-secondary)">{conv.messageCount}</td>
                    <td className="px-4 py-3 text-(--text-secondary)">{conv.totalTokensUsed}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        conv.status === 'active' ? 'bg-green-500/10 text-green-500' :
                        conv.status === 'archived' ? 'bg-(--surface-secondary) text-(--text-tertiary)' :
                        'bg-red-500/10 text-red-500'
                      )}>{conv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-(--text-tertiary)">
                      {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/dashboard/settings/chat/conversations/${conv.id}`}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) inline-flex">
                        <Eye size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="btn btn-secondary text-sm disabled:opacity-50">{__('Previous')}</button>
              <span className="text-sm text-(--text-tertiary) py-2">{page} / {data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}
                className="btn btn-secondary text-sm disabled:opacity-50">{__('Next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
