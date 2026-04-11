'use client';

import { useState } from 'react';
import { Link } from '@/components/Link';
import { Plus, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { accountRoutes } from '@/config/routes';
import { cn } from '@/lib/utils';
import { useBlankTranslations, dataTranslations } from '@/lib/translations';

const _d = dataTranslations('General');

const STATUS_LABELS: Record<string, string> = {
  open: _d('Open'),
  awaiting_user: _d('Awaiting You'),
  awaiting_admin: _d('Awaiting Staff'),
  resolved: _d('Resolved'),
  closed: _d('Closed'),
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  awaiting_user: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  awaiting_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: _d('Low'),
  normal: _d('Normal'),
  high: _d('High'),
  urgent: _d('Urgent'),
};

export default function AccountSupportPage() {
  const __ = useBlankTranslations();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.support.list.useQuery({
    status: statusFilter as 'open' | 'awaiting_user' | 'awaiting_admin' | 'resolved' | 'closed' | undefined,
    page,
    pageSize: 20,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{__('Support Tickets')}</h1>
        <Link
          href={accountRoutes.supportNew}
          className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Plus size={16} />
          {__('New Ticket')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[undefined, 'open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed'].map((status) => (
          <button
            key={status ?? 'all'}
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors',
              statusFilter === status
                ? 'bg-brand-500 text-white'
                : 'border border-(--border-primary) text-(--text-secondary) hover:bg-(--surface-secondary)',
            )}
          >
            {status ? __(STATUS_LABELS[status]!) : __('All')}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      ) : !data?.results.length ? (
        <div className="rounded-lg border border-(--border-primary) p-8 text-center">
          <p className="text-(--text-secondary)">{__('No tickets found.')}</p>
          <Link
            href={accountRoutes.supportNew}
            className="inline-block mt-3 text-sm text-brand-500 hover:text-brand-600"
          >
            {__('Create your first ticket')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.results.map((ticket) => (
            <Link
              key={ticket.id}
              href={accountRoutes.supportDetail(ticket.id)}
              className="block rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{ticket.subject}</h3>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-(--text-muted)">
                    <span>{__(PRIORITY_LABELS[ticket.priority] ?? ticket.priority)}</span>
                    <span>·</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className={cn('shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[ticket.status] ?? '')}>
                  {__(STATUS_LABELS[ticket.status] ?? ticket.status)}
                </span>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
              >
                {__('Previous')}
              </button>
              <span className="text-sm text-(--text-secondary)">
                Page {page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
              >
                {__('Next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
