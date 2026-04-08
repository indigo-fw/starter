'use client';

import { useState } from 'react';
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

const STATUS_COLORS: Record<JobStatus, string> = {
  waiting: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  active: 'bg-(--color-brand-100) dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-(--color-brand-700) dark:text-(--color-brand-400)',
  completed: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  failed: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  delayed: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
};


export default function JobQueuePage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<JobStatus>('failed');

  const stats = trpc.jobQueue.stats.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const jobList = trpc.jobQueue.list.useQuery(
    { queue: selectedQueue!, status: selectedStatus, page: 1 },
    { enabled: !!selectedQueue }
  );

  const retryJob = trpc.jobQueue.retry.useMutation({
    onSuccess: () => {
      toast.success(__('Job queued for retry'));
      utils.jobQueue.list.invalidate();
      utils.jobQueue.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeJob = trpc.jobQueue.remove.useMutation({
    onSuccess: () => {
      toast.success(__('Job removed'));
      utils.jobQueue.list.invalidate();
      utils.jobQueue.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const queueNames = Object.keys(stats.data ?? {});

  function formatTimestamp(ts: number | null) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Job Queue')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                utils.jobQueue.stats.invalidate();
                if (selectedQueue) utils.jobQueue.list.invalidate();
              }}
              className="btn btn-secondary"
            >
              <RefreshCw className="h-4 w-4" />
              {__('Refresh')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner job-queue-page">
      {stats.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      ) : queueNames.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-(--text-muted)">{__('No queues registered. Redis may not be configured.')}</p>
        </div>
      ) : (
        <>
          {/* Queue stats cards */}
          <div className="job-queue-stats mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queueNames.map((name) => {
              const q = stats.data![name];
              const isSelected = selectedQueue === name;
              return (
                <button
                  key={name}
                  onClick={() => setSelectedQueue(name)}
                  className={cn(
                    'card p-4 text-left transition-shadow',
                    isSelected && 'ring-2 ring-(--color-brand-500)'
                  )}
                >
                  <h3 className="font-semibold text-(--text-primary)">{name}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      ['waiting', 'active', 'completed', 'failed', 'delayed'] as JobStatus[]
                    ).map((status) => {
                      const count = q[status];
                      if (count === 0 && status !== 'failed') return null;
                      return (
                        <span
                          key={status}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_COLORS[status]
                          )}
                        >
                          {status}: {count}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Job list */}
          {selectedQueue && (
            <div className="mt-6">
              <div className="flex gap-1 border-b border-(--border-primary)">
                {(
                  ['failed', 'waiting', 'active', 'completed', 'delayed'] as JobStatus[]
                ).map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={cn(
                      'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
                      selectedStatus === status
                        ? 'border-(--color-brand-600) text-(--color-brand-600)'
                        : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
                    )}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              <div className="card mt-4 overflow-hidden">
                {jobList.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
                  </div>
                ) : (jobList.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-(--text-muted)">
                    {__('No jobs with this status.')}
                  </p>
                ) : (
                  <table className="w-full">
                    <thead className="table-thead">
                      <tr>
                        <th className="table-th">{__('ID')}</th>
                        <th className="table-th">{__('Name')}</th>
                        <th className="table-th">{__('Created')}</th>
                        <th className="table-th">{__('Attempts')}</th>
                        {selectedStatus === 'failed' && (
                          <th className="table-th">{__('Error')}</th>
                        )}
                        <th className="table-th w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {(jobList.data ?? []).map((job) => {
                        return (
                          <tr key={job.id} className="hover:bg-(--surface-secondary)">
                            <td className="table-td font-mono text-xs">{job.id}</td>
                            <td className="table-td text-sm">{job.name}</td>
                            <td className="table-td text-xs text-(--text-muted)">
                              {formatTimestamp(job.timestamp)}
                            </td>
                            <td className="table-td text-xs">{job.attemptsMade}</td>
                            {selectedStatus === 'failed' && (
                              <td className="table-td max-w-xs truncate text-xs text-red-600 dark:text-red-400">
                                {job.failedReason}
                              </td>
                            )}
                            <td className="table-td">
                              <div className="job-queue-row-actions flex items-center justify-end gap-1">
                                {selectedStatus === 'failed' && (
                                  <button
                                    onClick={() =>
                                      retryJob.mutate({
                                        queue: selectedQueue,
                                        jobId: String(job.id),
                                      })
                                    }
                                    className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--color-brand-600)"
                                    title={__('Retry')}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    removeJob.mutate({
                                      queue: selectedQueue,
                                      jobId: String(job.id),
                                    })
                                  }
                                  className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                                  title={__('Remove')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div></main>
    </>
  );
}
