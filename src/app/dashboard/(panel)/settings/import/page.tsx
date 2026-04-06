'use client';

import { useRef, useState } from 'react';
import {
  Upload,
  FileText,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { PostType } from '@/core/types/cms';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

type ImportFormat = 'wordpress' | 'ghost' | 'csv';

interface PreviewItem {
  title: string;
  slug: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt?: Date;
  categories?: string[];
  tags?: string[];
  metaDescription?: string;
  seoTitle?: string;
}

type Step = 'upload' | 'column-map' | 'preview' | 'result';

const FORMAT_OPTIONS: { value: ImportFormat; label: string; description: string }[] = [
  {
    value: 'wordpress',
    label: 'WordPress (WXR XML)',
    description: 'Export from WordPress via Tools > Export',
  },
  {
    value: 'ghost',
    label: 'Ghost (JSON)',
    description: 'Export from Ghost via Settings > Labs > Export',
  },
  {
    value: 'csv',
    label: 'CSV',
    description: 'Comma-separated values with headers',
  },
];

const CMS_FIELDS = [
  { key: 'title', label: 'Title', required: true },
  { key: 'slug', label: 'Slug', required: false },
  { key: 'content', label: 'Content', required: false },
  { key: 'status', label: 'Status', required: false },
  { key: 'publishedAt', label: 'Published Date', required: false },
  { key: 'metaDescription', label: 'Meta Description', required: false },
  { key: 'seoTitle', label: 'SEO Title', required: false },
  { key: 'categories', label: 'Categories', required: false },
  { key: 'tags', label: 'Tags', required: false },
] as const;

export default function ImportPage() {
  const __ = useAdminTranslations();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>('upload');

  // Upload state
  const [format, setFormat] = useState<ImportFormat>('wordpress');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // CSV column mapping
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});

  // Preview state
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Import options
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published' | ''>('');
  const [postType, setPostType] = useState<number>(PostType.BLOG);

  // Result state
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const previewMutation = trpc.import.preview.useMutation({
    onSuccess: (data) => {
      setPreviewItems(data.items as PreviewItem[]);
      setPreviewWarnings(data.warnings);
      setSelectedIndices(new Set(data.items.map((_: unknown, i: number) => i)));
      setStep('preview');
    },
    onError: (err) => toast.error(err.message),
  });

  const executeMutation = trpc.import.execute.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setStep('result');
    },
    onError: (err) => toast.error(err.message),
  });

  // ── File handling ──────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error(__('File size exceeds 50MB limit'));
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);

      // For CSV, extract headers for column mapping
      if (format === 'csv') {
        const firstLine = text.split('\n')[0] ?? '';
        const headers = parseCsvHeaders(firstLine);
        setCsvHeaders(headers);
        // Auto-map headers that match field names
        const autoMap: Record<string, string> = {};
        for (const field of CMS_FIELDS) {
          const matched = headers.find(
            (h) => h.toLowerCase() === field.key.toLowerCase()
          );
          if (matched) autoMap[field.key] = matched;
        }
        setColumnMap(autoMap);
      }
    };
    reader.onerror = () => toast.error(__('Failed to read file'));
    reader.readAsText(file);

    // Reset input so re-selecting same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function parseCsvHeaders(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ── Navigation ─────────────────────────────────────────────────────

  function handleUploadNext() {
    if (!fileContent) {
      toast.error(__('Please select a file first'));
      return;
    }

    if (format === 'csv' && csvHeaders.length > 0) {
      setStep('column-map');
    } else {
      runPreview();
    }
  }

  function runPreview() {
    if (!fileContent) return;
    previewMutation.mutate({
      content: fileContent,
      format,
      columnMap: format === 'csv' ? columnMap : undefined,
    });
  }

  function handleImport() {
    const selected = previewItems
      .filter((_, i) => selectedIndices.has(i))
      .map((item) => ({
        title: item.title,
        slug: item.slug,
        content: item.content,
        status: item.status,
        publishedAt: item.publishedAt
          ? new Date(item.publishedAt).toISOString()
          : undefined,
        metaDescription: item.metaDescription,
        seoTitle: item.seoTitle,
      }));

    if (selected.length === 0) {
      toast.error(__('No items selected'));
      return;
    }

    executeMutation.mutate({
      items: selected,
      defaultStatus: defaultStatus || undefined,
      postType,
    });
  }

  function handleReset() {
    setStep('upload');
    setFileContent(null);
    setFileName(null);
    setCsvHeaders([]);
    setColumnMap({});
    setPreviewItems([]);
    setPreviewWarnings([]);
    setSelectedIndices(new Set());
    setResult(null);
  }

  // ── Selection helpers ──────────────────────────────────────────────

  function toggleItem(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIndices.size === previewItems.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(previewItems.map((_, i) => i)));
    }
  }

  // ── Step indicator ─────────────────────────────────────────────────

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    ...(format === 'csv' ? [{ key: 'column-map' as Step, label: 'Map Columns' }] : []),
    { key: 'preview', label: 'Preview' },
    { key: 'result', label: 'Import' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  function formatDate(date: Date | string | undefined) {
    if (!date) return '--';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function truncate(text: string, maxLen: number) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {__('Import Content')}
          </h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner import-page">
      {/* Step indicator */}
      <div className="import-steps mt-4 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRight className="h-4 w-4 text-(--text-muted)" />
            )}
            <span
              className={cn(
                'text-sm font-medium',
                i === currentStepIndex
                  ? 'text-brand-600'
                  : i < currentStepIndex
                    ? 'text-(--text-primary)'
                    : 'text-(--text-muted)'
              )}
            >
              {__(s.label)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step: Upload ────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="mt-6 space-y-6">
          {/* Format selection */}
          <div className="card p-6">
            <h2 className="h2">{__('Import Format')}</h2>
            <div className="import-formats mt-4 grid gap-3 sm:grid-cols-3">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setFormat(opt.value);
                    setFileContent(null);
                    setFileName(null);
                    setCsvHeaders([]);
                    setColumnMap({});
                  }}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    format === opt.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-(--border-primary) hover:border-(--border-primary) hover:bg-(--surface-secondary)'
                  )}
                >
                  <div className="text-sm font-medium text-(--text-primary)">
                    {__(opt.label)}
                  </div>
                  <div className="mt-1 text-xs text-(--text-muted)">
                    {__(opt.description)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* File upload */}
          <div className="card p-6">
            <h2 className="h2">{__('Select File')}</h2>
            <div className="mt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  format === 'wordpress'
                    ? '.xml'
                    : format === 'ghost'
                      ? '.json'
                      : '.csv'
                }
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="import-dropzone flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-(--border-primary) px-6 py-10 transition-colors hover:border-brand-400 hover:bg-(--surface-secondary)"
              >
                {fileName ? (
                  <>
                    <FileText className="h-10 w-10 text-brand-500" />
                    <p className="mt-2 text-sm font-medium text-(--text-primary)">
                      {fileName}
                    </p>
                    <p className="mt-1 text-xs text-(--text-muted)">
                      {__('Click to change file')}
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-(--text-muted)" />
                    <p className="mt-2 text-sm text-(--text-muted)">
                      {__('Click to select a file (max 50MB)')}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Import options */}
          <div className="card p-6">
            <h2 className="h2">{__('Import Options')}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-(--text-secondary)">
                  {__('Post Type')}
                </label>
                <select
                  value={postType}
                  onChange={(e) => setPostType(Number(e.target.value))}
                  className="select mt-1 w-48"
                >
                  <option value={PostType.BLOG}>{__('Blog Post')}</option>
                  <option value={PostType.PAGE}>{__('Page')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-(--text-secondary)">
                  {__('Override Status')}
                </label>
                <select
                  value={defaultStatus}
                  onChange={(e) =>
                    setDefaultStatus(
                      e.target.value as 'draft' | 'published' | ''
                    )
                  }
                  className="select mt-1 w-48"
                >
                  <option value="">{__('Keep original status')}</option>
                  <option value="draft">{__('Import all as Draft')}</option>
                  <option value="published">
                    {__('Import all as Published')}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUploadNext}
              disabled={!fileContent}
              className="btn btn-primary disabled:opacity-50"
            >
              {__('Next')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Column Map (CSV only) ─────────────────────────────── */}
      {step === 'column-map' && (
        <div className="mt-6 space-y-6">
          <div className="card p-6">
            <h2 className="h2">{__('Map CSV Columns')}</h2>
            <p className="mt-1 text-sm text-(--text-muted)">
              {__(
                'Map your CSV column headers to CMS fields. Only Title is required.'
              )}
            </p>
            <div className="mt-4 space-y-3">
              {CMS_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-4"
                >
                  <label className="w-40 text-sm font-medium text-(--text-secondary)">
                    {__(field.label)}
                    {field.required && (
                      <span className="ml-0.5 text-red-500">*</span>
                    )}
                  </label>
                  <select
                    value={columnMap[field.key] ?? ''}
                    onChange={(e) => {
                      setColumnMap((prev) => {
                        const next = { ...prev };
                        if (e.target.value) {
                          next[field.key] = e.target.value;
                        } else {
                          delete next[field.key];
                        }
                        return next;
                      });
                    }}
                    className="select w-64"
                  >
                    <option value="">{__('-- Skip --')}</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="btn btn-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              {__('Back')}
            </button>
            <button
              type="button"
              onClick={runPreview}
              disabled={!columnMap.title || previewMutation.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {previewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {__('Preview')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Preview ───────────────────────────────────────────── */}
      {step === 'preview' && (
        <div className="mt-6 space-y-6">
          {/* Warnings */}
          {previewWarnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {__('Warnings')}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {previewWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-yellow-700">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-(--text-secondary)">
                {selectedIndices.size} {__('of')} {previewItems.length}{' '}
                {__('items selected')}
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-brand-600 hover:underline"
              >
                {selectedIndices.size === previewItems.length
                  ? __('Deselect all')
                  : __('Select all')}
              </button>
            </div>
          </div>

          {/* Items table */}
          {previewItems.length > 0 && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="thead">
                      <th className="th w-10">
                        <input
                          type="checkbox"
                          checked={selectedIndices.size === previewItems.length}
                          onChange={toggleAll}
                          className="rounded border-(--border-primary)"
                        />
                      </th>
                      <th className="th">{__('Title')}</th>
                      <th className="th">{__('Slug')}</th>
                      <th className="th">{__('Status')}</th>
                      <th className="th">{__('Date')}</th>
                      <th className="th">{__('Categories')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item, i) => (
                      <tr
                        key={i}
                        className={cn(
                          'transition-colors hover:bg-(--surface-secondary)',
                          !selectedIndices.has(i) && 'opacity-40'
                        )}
                      >
                        <td className="td">
                          <input
                            type="checkbox"
                            checked={selectedIndices.has(i)}
                            onChange={() => toggleItem(i)}
                            className="rounded border-(--border-primary)"
                          />
                        </td>
                        <td className="td max-w-xs">
                          <span className="font-medium text-(--text-primary)">
                            {truncate(item.title, 60)}
                          </span>
                        </td>
                        <td className="td">
                          <code className="text-xs text-(--text-muted)">
                            {truncate(item.slug, 40)}
                          </code>
                        </td>
                        <td className="td">
                          <span
                            className={cn(
                              'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                              item.status === 'published'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            )}
                          >
                            {item.status === 'published'
                              ? __('Published')
                              : __('Draft')}
                          </span>
                        </td>
                        <td className="td text-xs">
                          {formatDate(item.publishedAt)}
                        </td>
                        <td className="td text-xs text-(--text-muted)">
                          {(item.categories ?? []).join(', ') || '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previewItems.length === 0 && (
            <div className="card flex flex-col items-center py-12">
              <FileText className="h-10 w-10 text-(--text-muted)" />
              <p className="mt-3 text-sm text-(--text-muted)">
                {__('No items found in this file')}
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() =>
                setStep(format === 'csv' ? 'column-map' : 'upload')
              }
              className="btn btn-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
              {__('Back')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                selectedIndices.size === 0 || executeMutation.isPending
              }
              className="btn btn-primary disabled:opacity-50"
            >
              {executeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {executeMutation.isPending
                ? __('Importing...')
                : `${__('Import')} ${selectedIndices.size} ${__('items')}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Result ────────────────────────────────────────────── */}
      {step === 'result' && result && (
        <div className="mt-6 space-y-6">
          {/* Success summary */}
          <div className="card p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <h2 className="h2">{__('Import Complete')}</h2>
                <p className="mt-1 text-sm text-(--text-muted)">
                  {result.created} {__('items created')}
                  {result.skipped > 0 &&
                    `, ${result.skipped} ${__('skipped')}`}
                </p>
              </div>
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="card p-6">
              <h2 className="h2 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                {__('Errors')} ({result.errors.length})
              </h2>
              <ul className="mt-3 space-y-1">
                {result.errors.map((err, i) => (
                  <li
                    key={i}
                    className="text-sm text-red-600"
                  >
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-primary"
            >
              {__('Import More')}
            </button>
          </div>
        </div>
      )}
    </div></main>
    </>
  );
}
