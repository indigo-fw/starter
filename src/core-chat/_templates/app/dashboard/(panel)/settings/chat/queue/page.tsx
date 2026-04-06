'use client';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TaskQueuePage() {
  const __ = useAdminTranslations();
  const { data: queues, isLoading } = trpc.chatTaskQueue.list.useQuery();
  const retryMutation = trpc.chatTaskQueue.retry.useMutation();
  const utils = trpc.useUtils();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Task Queues')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">{__('BullMQ job queue status and failed job management')}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>
      ) : !queues?.length ? (
        <div className="card p-8 text-center text-sm text-(--text-tertiary)">
          {__('No queues found. Workers may not be running.')}
        </div>
      ) : (
        <div className="space-y-4">
          {queues.map((q) => (
            <QueueCard key={q.name} queue={q} onRetry={(jobId) => {
              retryMutation.mutate({ queueName: q.name, jobId }, {
                onSuccess: () => utils.chatTaskQueue.list.invalidate(),
              });
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard({ queue, onRetry }: { queue: Record<string, unknown>; onRetry: (jobId: string) => void }) {
  const __ = useAdminTranslations();
  const name = queue.name as string;
  const waiting = (queue.waiting as number) ?? 0;
  const active = (queue.active as number) ?? 0;
  const completed = (queue.completed as number) ?? 0;
  const failed = (queue.failed as number) ?? 0;

  const { data: failedJobs } = trpc.chatTaskQueue.failed.useQuery(
    { queueName: name, limit: 10 },
    { enabled: failed > 0 },
  );

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-(--text-primary) font-mono text-sm">{name}</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-(--text-tertiary)">{__('Waiting')}: <strong>{waiting}</strong></span>
          <span className="text-blue-500">{__('Active')}: <strong>{active}</strong></span>
          <span className="text-green-500">{__('Done')}: <strong>{completed}</strong></span>
          <span className={cn(failed > 0 ? 'text-red-500' : 'text-(--text-tertiary)')}>{__('Failed')}: <strong>{failed}</strong></span>
        </div>
      </div>

      {failedJobs && failedJobs.length > 0 && (
        <div className="mt-3 border-t border-(--border-primary) pt-3">
          <h4 className="text-xs font-medium text-(--text-secondary) mb-2">{__('Failed Jobs')}</h4>
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <div key={job.id} className="flex items-start justify-between gap-3 text-xs bg-(--surface-secondary) rounded-lg p-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-(--text-primary)">{job.name} #{job.id}</div>
                  <div className="text-red-500 truncate mt-0.5">{job.failedReason}</div>
                  <div className="text-(--text-tertiary) mt-0.5">{__('Attempts')}: {job.attemptsMade}</div>
                </div>
                <button
                  onClick={() => onRetry(String(job.id))}
                  className="shrink-0 p-1.5 rounded text-(--text-tertiary) hover:text-brand-500 hover:bg-brand-500/10"
                  title={__('Retry')}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
