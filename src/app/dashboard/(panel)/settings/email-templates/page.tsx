'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, RotateCcw, Save } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { TemplateName } from '@/server/jobs/email';

const TEMPLATES: { name: TemplateName; label: string; variables: string[] }[] = [
  {
    name: 'welcome',
    label: 'Welcome',
    variables: ['siteName', 'appUrl'],
  },
  {
    name: 'verify-email',
    label: 'Email Verification',
    variables: ['name', 'verifyUrl', 'siteName'],
  },
  {
    name: 'password-reset',
    label: 'Password Reset',
    variables: ['name', 'resetUrl', 'siteName'],
  },
  {
    name: 'invitation',
    label: 'Organization Invitation',
    variables: ['organizationName', 'inviteUrl', 'siteName'],
  },
  {
    name: 'payment-failed',
    label: 'Payment Failed',
    variables: ['billingUrl', 'siteName'],
  },
  {
    name: 'subscription-activated',
    label: 'Subscription Activated',
    variables: ['planName', 'dashboardUrl', 'siteName'],
  },
  {
    name: 'subscription-expiring',
    label: 'Subscription Expiring',
    variables: ['planName', 'daysLeft', 'billingUrl', 'siteName'],
  },
  {
    name: 'subscription-expired',
    label: 'Subscription Expired',
    variables: ['planName', 'billingUrl', 'siteName'],
  },
  {
    name: 'subscription-canceled',
    label: 'Subscription Canceled',
    variables: ['planName', 'billingUrl', 'siteName'],
  },
];

// ---------------------------------------------------------------------------
// Editor sub-component — keyed on `editing` so it remounts with fresh state
// ---------------------------------------------------------------------------

function TemplateEditor({
  templateName,
  initialSubject,
  initialHtml,
  hasOverride,
  onClose,
}: {
  templateName: TemplateName;
  initialSubject: string;
  initialHtml: string;
  hasOverride: boolean;
  onClose: () => void;
}) {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [subject, setSubject] = useState(initialSubject);
  const [html, setHtml] = useState(initialHtml);
  const [resetTarget, setResetTarget] = useState<TemplateName | null>(null);

  const template = TEMPLATES.find((t) => t.name === templateName)!;

  const setOption = trpc.options.set.useMutation({
    onSuccess: () => {
      toast.success(__('Template saved'));
      utils.options.getByPrefix.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteOption = trpc.options.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Template reset to default'));
      utils.options.getByPrefix.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  // Update preview iframe when html changes
  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  function handleSave() {
    setOption.mutate({
      key: `email.template.en.${templateName}`,
      value: { subject, html },
    });
  }

  function handleReset() {
    if (!resetTarget) return;
    deleteOption.mutate({ key: `email.template.en.${resetTarget}` });
    setResetTarget(null);
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {__('Edit: {label}', { label: template.label })}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {hasOverride && (
              <button
                onClick={() => setResetTarget(templateName)}
                className="btn btn-secondary"
              >
                <RotateCcw className="h-4 w-4" />
                {__('Reset to Default')}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={setOption.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {setOption.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {__('Save')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner email-editor-page">
      <div className="space-y-4">
        <div className="card p-4">
          <label className="block text-sm font-medium text-(--text-secondary)">
            {__('Subject')}
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input mt-1"
            placeholder={__('Email subject line')}
          />
        </div>

        <div className="card p-4">
          <label className="block text-sm font-medium text-(--text-secondary)">
            {__('HTML Body')}
          </label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={16}
            className="textarea mt-1 font-mono text-xs"
            placeholder="<html>...</html>"
          />
        </div>

        <div className="card p-4">
          <p className="text-sm font-medium text-(--text-secondary)">
            {__('Available Variables')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {template.variables.map((v) => (
              <code
                key={v}
                className="rounded bg-(--surface-secondary) px-2 py-0.5 text-xs text-(--text-secondary)"
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
        </div>

        {html && (
          <div className="card p-4">
            <p className="text-sm font-medium text-(--text-secondary)">
              {__('Preview')}
            </p>
            <iframe
              ref={iframeRef}
              title="Email preview"
              className="mt-2 h-80 w-full rounded border border-(--border-primary) bg-white"
              sandbox=""
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!resetTarget}
        title={__('Reset to default?')}
        message={__('This will remove your customizations and revert to the file-based template.')}
        confirmLabel={__('Reset')}
        variant="danger"
        onConfirm={handleReset}
        onCancel={() => setResetTarget(null)}
      />
    </div></main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function EmailTemplatesPage() {
  const __ = useAdminTranslations();

  const [editing, setEditing] = useState<TemplateName | null>(null);

  const templateOptions = trpc.options.getByPrefix.useQuery(
    { prefix: 'email.template.' },
    { enabled: true }
  );

  const overrideData = useMemo(() => {
    if (!templateOptions.data) return {} as Record<string, unknown>;
    return templateOptions.data as Record<string, unknown>;
  }, [templateOptions.data]);

  function getOverrideStatus(name: TemplateName): boolean {
    return !!overrideData[`email.template.en.${name}`];
  }

  if (templateOptions.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (editing) {
    const override = overrideData[`email.template.en.${editing}`] as
      | { subject?: string; html?: string }
      | undefined;
    return (
      <TemplateEditor
        key={editing}
        templateName={editing}
        initialSubject={override?.subject ?? ''}
        initialHtml={override?.html ?? ''}
        hasOverride={getOverrideStatus(editing)}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {__('Email Templates')}
          </h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner email-templates-page">
      <p className="text-sm text-(--text-muted)">
        {__('Customize email templates. Overrides are stored in the database; unmodified templates use the default file.')}
      </p>

      <div className="email-templates-cards mt-4 grid gap-4 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const hasOverride = getOverrideStatus(t.name);
          return (
            <button
              key={t.name}
              onClick={() => setEditing(t.name)}
              className="card p-4 text-left transition-shadow hover:ring-1 hover:ring-brand-400"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-(--text-primary)">
                  {__(t.label)}
                </h3>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    hasOverride
                      ? 'bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400'
                      : 'bg-(--surface-secondary) text-(--text-muted)'
                  )}
                >
                  {hasOverride ? __('Custom') : __('Default')}
                </span>
              </div>
              <p className="mt-1 text-xs text-(--text-muted)">
                {__('Variables: {vars}', { vars: t.variables.map((v) => `{{${v}}}`).join(', ') })}
              </p>
            </button>
          );
        })}
      </div>
    </div></main>
    </>
  );
}
