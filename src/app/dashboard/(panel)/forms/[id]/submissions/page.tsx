'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function SubmissionsPage() {
  const __ = useAdminTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const utils = trpc.useUtils();

  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Fetch form definition for field headers
  const formQuery = trpc.forms.get.useQuery({ id: params.id });

  // Fetch submissions
  const submissionsQuery = trpc.forms.submissions.useQuery({
    formId: params.id,
    page,
    pageSize: 20,
  });

  const deleteSubmission = trpc.forms.deleteSubmission.useMutation({
    onSuccess: () => {
      toast.success(__('Submission deleted'));
      utils.forms.submissions.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // ---------------------------------------------------------------------------
  // Export handlers
  // ---------------------------------------------------------------------------

  async function handleExport(format: 'json' | 'csv') {
    try {
      const result = await utils.forms.exportSubmissions.fetch({
        formId: params.id,
        format,
      });

      // Download as file
      const blob = new Blob([result.content], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(__('Export downloaded'));
    } catch {
      toast.error(__('Export failed'));
    }
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const form = formQuery.data;
  const fields = form
    ? (form.fields as Array<{ id: string; label: string; type: string }>)
    : [];
  const data = submissionsQuery.data;

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (formQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (formQuery.isError || !form) {
    return (
      <div className="py-24 text-center text-sm text-(--text-muted)">
        {__('Form not found.')}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="submissions-header-left flex items-center gap-3">
            <button
              onClick={() => router.push(adminPanel.formDetail(params.id))}
              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-(--text-primary)">
                {__('Submissions')}
              </h1>
              <p className="text-sm text-(--text-muted)">{form.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="btn btn-secondary"
            >
              <Download className="h-4 w-4" />
              {__('CSV')}
            </button>
            <button
              onClick={() => handleExport('json')}
              className="btn btn-secondary"
            >
              <Download className="h-4 w-4" />
              {__('JSON')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner submissions-page">
      {/* Table */}
      <div className="card mt-4 overflow-hidden">
        {submissionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (data?.results ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No submissions yet.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="thead">
                <tr>
                  <th className="th w-40">{__('Submitted')}</th>
                  {fields.map((field) => (
                    <th key={field.id} className="th">
                      {field.label}
                    </th>
                  ))}
                  <th className="th w-28">{__('IP')}</th>
                  <th className="th w-16" />
                </tr>
              </thead>
              <tbody>
                {(data?.results ?? []).map((submission) => {
                  const submissionData = submission.data as Record<
                    string,
                    unknown
                  >;
                  return (
                    <tr
                      key={submission.id}
                      className="hover:bg-(--surface-secondary)"
                    >
                      <td className="td text-xs text-(--text-muted)">
                        {formatDate(submission.createdAt)}
                      </td>
                      {fields.map((field) => (
                        <td key={field.id} className="td">
                          <span className="text-sm text-(--text-primary)">
                            {field.type === 'checkbox'
                              ? submissionData[field.id]
                                ? __('Yes')
                                : __('No')
                              : String(submissionData[field.id] ?? '')}
                          </span>
                        </td>
                      ))}
                      <td className="td text-xs text-(--text-muted)">
                        {submission.ip ?? '—'}
                      </td>
                      <td className="td">
                        <button
                          onClick={() => setDeleteTarget(submission.id)}
                          className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                          title={__('Delete submission')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="submissions-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="submissions-pagination-buttons flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(data.totalPages, p + 1))
              }
              disabled={page >= data.totalPages}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete submission?')}
        message={__('Delete this submission? This cannot be undone.')}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteSubmission.mutate({ id: deleteTarget });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
