'use client';

import { useState } from 'react';

import { ArrowLeft, Loader2 } from 'lucide-react';

import { Link } from '@/components/Link';
import { accountRoutes } from '@/config/routes';
import { useRouter } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';

export default function NewTicketPage() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<
    'low' | 'normal' | 'high' | 'urgent'
  >('normal');
  const [error, setError] = useState('');

  const createTicket = trpc.support.create.useMutation({
    onSuccess: (data) => {
      router.push({
        pathname: '/account/support/[id]',
        params: { id: data.id },
      });
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    createTicket.mutate({ subject, body, priority });
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={accountRoutes.support}
          className="rounded-lg p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{__('New Support Ticket')}</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-4 rounded-lg border border-(--border-primary) p-6"
      >
        {error && (
          <div className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">
            {__('Subject')}
          </label>
          <input
            type="text"
            required
            maxLength={255}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm"
            placeholder={__('Briefly describe your issue')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            {__('Priority')}
          </label>
          <select
            value={priority}
            onChange={(e) =>
              setPriority(
                e.target.value as 'low' | 'normal' | 'high' | 'urgent'
              )
            }
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm"
          >
            <option value="low">{__('Low')}</option>
            <option value="normal">{__('Normal')}</option>
            <option value="high">{__('High')}</option>
            <option value="urgent">{__('Urgent')}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            {__('Description')}
          </label>
          <textarea
            required
            maxLength={5000}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-y rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm"
            placeholder={__('Provide as much detail as possible...')}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createTicket.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {createTicket.isPending && (
              <Loader2 size={16} className="animate-spin" />
            )}
            {createTicket.isPending ? __('Submitting...') : __('Submit Ticket')}
          </button>
          <Link
            href={accountRoutes.support}
            className="rounded-lg border border-(--border-primary) px-4 py-2 text-sm transition-colors hover:bg-(--surface-secondary)"
          >
            {__('Cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
