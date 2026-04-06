'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Loader2, CheckCircle } from 'lucide-react';

export default function FlaggedMessagesPage() {
  const __ = useAdminTranslations();
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.chatAdmin.flaggedMessages.useQuery({ page, pageSize: 20 });
  const dismissMutation = trpc.chatAdmin.dismissFlag.useMutation();
  const utils = trpc.useUtils();

  function handleDismiss(messageId: string) {
    dismissMutation.mutate({ messageId }, {
      onSuccess: () => utils.chatAdmin.flaggedMessages.invalidate(),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Flagged Messages')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">{__('Messages blocked by content moderation')}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>
      ) : !data?.results.length ? (
        <div className="text-center py-12 text-sm text-(--text-tertiary)">{__('No flagged messages.')}</div>
      ) : (
        <>
          <div className="space-y-3">
            {data.results.map((msg) => {
              const modResult = msg.moderationResult as { reason?: string } | null;
              return (
                <div key={msg.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-(--text-tertiary) mb-2">
                        <span className="font-medium text-(--text-secondary)">{msg.userName}</span>
                        <span>→</span>
                        <span>{msg.characterName}</span>
                        <span>·</span>
                        <span>{new Date(msg.createdAt!).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-(--text-primary) bg-(--surface-secondary) rounded-lg p-3 break-words">
                        {msg.content}
                      </p>
                      {modResult?.reason && (
                        <p className="text-xs text-red-500 mt-1.5">
                          {__('Reason')}: {modResult.reason}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDismiss(msg.id)}
                      disabled={dismissMutation.isPending}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-(--surface-secondary) text-(--text-secondary) hover:bg-green-500/10 hover:text-green-500 transition-colors"
                      title={__('Dismiss flag')}
                    >
                      <CheckCircle size={14} />
                      {__('Dismiss')}
                    </button>
                  </div>
                </div>
              );
            })}
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
