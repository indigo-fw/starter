'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

// ─── Shared constants ───────────────────────────────────────────────────────

const TICKET_STATUSES = ['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  awaiting_user: 'Awaiting User',
  awaiting_admin: 'Awaiting Admin',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '',
  normal: '',
  high: 'text-amber-600 dark:text-amber-400',
  urgent: 'text-red-600 dark:text-red-400 font-semibold',
};

const CHAT_STATUS_LABELS: Record<string, string> = {
  ai_active: 'AI Active',
  agent_active: 'Agent Active',
  escalated: 'Escalated',
  closed: 'Closed',
};

// ─── Tickets Tab ────────────────────────────────────────────────────────────

function TicketsTab({ __: t }: { __: (s: string) => string }) {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: stats } = trpc.support.getStats.useQuery();
  const { data, isLoading } = trpc.support.adminList.useQuery({
    status: statusFilter as (typeof TICKET_STATUSES)[number] | undefined,
    priority: priorityFilter as (typeof PRIORITIES)[number] | undefined,
    page,
    pageSize: 20,
  });

  return (
    <>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{stats.total ?? 0}</div>
            <div className="text-xs text-(--text-muted)">{t('Total')}</div>
          </div>
          {TICKET_STATUSES.map((s) => (
            <div key={s} className="card p-3 text-center">
              <div className="text-2xl font-bold tabular-nums">{stats[s] ?? 0}</div>
              <div className="text-xs text-(--text-muted)">{t(STATUS_LABELS[s])}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={statusFilter ?? ''}
          onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(1); }}
          className="filter-select"
        >
          <option value="">{t('All Statuses')}</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>
          ))}
        </select>
        <select
          value={priorityFilter ?? ''}
          onChange={(e) => { setPriorityFilter(e.target.value || undefined); setPage(1); }}
          className="filter-select"
        >
          <option value="">{t('All Priorities')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{t(PRIORITY_LABELS[p])}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : !data?.results.length ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {t('No tickets found.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{t('Subject')}</th>
                <th className="th w-28">{t('Status')}</th>
                <th className="th w-24">{t('Priority')}</th>
                <th className="th w-20">{t('Source')}</th>
                <th className="th w-32">{t('Created')}</th>
                <th className="th w-32">{t('Updated')}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((ticket) => (
                <tr key={ticket.id} className="tr">
                  <td className="td">
                    <Link
                      href={adminPanel.settingsSupportDetail(ticket.id)}
                      className="font-medium text-(--text-primary) hover:text-(--color-brand-500)"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="td">
                    <span className={cn(
                      'badge',
                      ticket.status === 'open' && 'badge-published',
                      ticket.status === 'closed' && 'badge-draft',
                      ticket.status === 'resolved' && 'badge-published',
                      (ticket.status === 'awaiting_user' || ticket.status === 'awaiting_admin') && 'badge-scheduled',
                    )}>
                      {t(STATUS_LABELS[ticket.status] ?? ticket.status)}
                    </span>
                  </td>
                  <td className={cn('td text-sm', PRIORITY_COLORS[ticket.priority] ?? '')}>
                    {t(PRIORITY_LABELS[ticket.priority] ?? ticket.priority)}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {ticket.source ?? 'form'}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {new Date(ticket.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="pagination mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {t('Previous')}
          </button>
          <span className="text-sm text-(--text-secondary)">
            {t('Page')} {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {t('Next')}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Live Chats Tab ─────────────────────────────────────────────────────────

function LiveChatsTab({ __: t }: { __: (s: string) => string }) {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: stats } = trpc.supportChat.getStats.useQuery();
  const { data, isLoading } = trpc.supportChat.adminList.useQuery({
    status: statusFilter as 'ai_active' | 'agent_active' | 'escalated' | 'closed' | undefined,
    page,
    pageSize: 20,
  });

  return (
    <>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['ai_active', 'agent_active', 'escalated', 'closed'] as const).map((s) => (
            <div key={s} className="card p-3 text-center">
              <div className="text-2xl font-bold tabular-nums">{stats[s] ?? 0}</div>
              <div className="text-xs text-(--text-muted)">{t(CHAT_STATUS_LABELS[s])}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={statusFilter ?? ''}
          onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(1); }}
          className="filter-select"
        >
          <option value="">{t('Active (non-closed)')}</option>
          <option value="ai_active">{t('AI Active')}</option>
          <option value="agent_active">{t('Agent Active')}</option>
          <option value="escalated">{t('Escalated')}</option>
          <option value="closed">{t('Closed')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : !data?.results.length ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {t('No active chats.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{t('Visitor / User')}</th>
                <th className="th w-28">{t('Status')}</th>
                <th className="th">{t('Last Message')}</th>
                <th className="th w-32">{t('Started')}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((session) => (
                <tr key={session.id} className="tr">
                  <td className="td">
                    <Link
                      href={`${adminPanel.settingsSupport}/chat/${session.id}`}
                      className="font-medium text-(--text-primary) hover:text-(--color-brand-500)"
                    >
                      {session.userName || session.userEmail || session.email || `Visitor ${session.visitorId.slice(0, 8)}…`}
                    </Link>
                    {session.ticketId && (
                      <Link
                        href={adminPanel.settingsSupportDetail(session.ticketId)}
                        className="ml-2 text-xs text-(--color-brand-500) hover:underline"
                      >
                        → Ticket
                      </Link>
                    )}
                  </td>
                  <td className="td">
                    <span className={cn(
                      'badge',
                      session.status === 'ai_active' && 'badge-published',
                      session.status === 'agent_active' && 'badge-scheduled',
                      session.status === 'escalated' && 'badge-scheduled',
                      session.status === 'closed' && 'badge-draft',
                    )}>
                      {t(CHAT_STATUS_LABELS[session.status] ?? session.status)}
                    </span>
                  </td>
                  <td className="td text-sm text-(--text-muted) max-w-xs truncate">
                    {session.lastMessage ? (
                      <span>
                        <span className="font-medium">{session.lastMessage.role === 'user' ? 'User' : session.lastMessage.role === 'ai' ? 'AI' : 'Agent'}:</span>{' '}
                        {session.lastMessage.body}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="pagination mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {t('Previous')}
          </button>
          <span className="text-sm text-(--text-secondary)">
            {t('Page')} {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {t('Next')}
          </button>
        </div>
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

type Tab = 'tickets' | 'chats';

export default function AdminSupportPage() {
  const __ = useAdminTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('tickets');

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.settings}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Support')}</h1>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner support-page">
      {/* Tab bar */}
      <div className="status-tabs mt-4">
        <button
          className={cn('status-tab', activeTab === 'tickets' && 'active')}
          onClick={() => setActiveTab('tickets')}
        >
          {__('Tickets')}
        </button>
        <button
          className={cn('status-tab', activeTab === 'chats' && 'active')}
          onClick={() => setActiveTab('chats')}
        >
          <MessageCircle className="mr-1.5 inline h-4 w-4" />
          {__('Live Chats')}
        </button>
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeTab === 'tickets' ? (
          <TicketsTab __={__} />
        ) : (
          <LiveChatsTab __={__} />
        )}
      </div>
    </div></main>
    </>
  );
}
