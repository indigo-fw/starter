'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/translations';

export interface CustomFieldsEditorHandle {
  save: (contentId: string) => Promise<void>;
}

/** Render function for a custom field type. Projects can provide additional renderers. */
export type FieldRenderer = (props: {
  value: unknown;
  options: Record<string, unknown> | null;
  slug: string;
  onChange: (slug: string, value: unknown) => void;
  __: (key: string) => string;
}) => React.ReactNode;

interface CustomFieldsEditorProps {
  contentType: string;
  contentId?: string;
  /** Whether the user is authenticated. Controls query enabling. Defaults to true. */
  isAuthenticated?: boolean;
  /** Additional or override field type renderers. Merged with built-in defaults. */
  fieldRenderers?: Record<string, FieldRenderer>;
}

export const CustomFieldsEditor = forwardRef<
  CustomFieldsEditorHandle,
  CustomFieldsEditorProps
>(function CustomFieldsEditor({ contentType, contentId, isAuthenticated = true, fieldRenderers }, ref) {
  const __ = useAdminTranslations();

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [prevContentId, setPrevContentId] = useState(contentId);
  const [prevServerData, setPrevServerData] = useState<Record<string, unknown> | undefined>(undefined);

  const definitions = trpc.customFields.listForContentType.useQuery(
    { contentType },
    { enabled: isAuthenticated }
  );

  const existingValues = trpc.customFields.getValues.useQuery(
    { contentType, contentId: contentId! },
    { enabled: !!contentId && isAuthenticated }
  );

  const saveValues = trpc.customFields.saveValues.useMutation();

  // Reset state when contentId changes (adjust state during render)
  if (prevContentId !== contentId) {
    setPrevContentId(contentId);
    if (!contentId) {
      setValues({});
    }
    setPrevServerData(undefined);
  }

  // Sync server data to local state when it arrives (adjust state during render)
  if (existingValues.data && existingValues.data !== prevServerData) {
    setPrevServerData(existingValues.data);
    setValues(existingValues.data);
  }

  const handleFieldChange = useCallback(
    (slug: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [slug]: value }));
    },
    []
  );

  // Stable ref to current values to avoid useCallback dependency on `values`
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; });

  const saveValuesRef = useRef(saveValues.mutateAsync);
  useEffect(() => { saveValuesRef.current = saveValues.mutateAsync; });

  const save = useCallback(
    async (targetContentId: string) => {
      if (!definitions.data || definitions.data.length === 0) return;
      await saveValuesRef.current({
        contentType,
        contentId: targetContentId,
        values: valuesRef.current,
      });
    },
    [contentType, definitions.data]
  );

  // Expose save method to parent via ref
  useImperativeHandle(ref, () => ({ save }), [save]);

  if (definitions.isLoading) {
    return (
      <div className="card p-6">
        <div className="custom-fields-loading flex items-center gap-2 text-(--text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="custom-fields-loading-label text-sm">{__('Loading custom fields...')}</span>
        </div>
      </div>
    );
  }

  if (!definitions.data || definitions.data.length === 0) {
    return null;
  }

  return (
    <div className="card p-6">
      <h3 className="h2">{__('Custom Fields')}</h3>
      <div className="mt-4 space-y-4">
        {definitions.data.map((def) => {
          const slug = def.slug;
          const fieldValue = values[slug];
          const opts = def.options as Record<string, unknown> | null;

          return (
            <div key={def.id} className="custom-fields-group">
              <label className="block text-sm font-medium text-(--text-secondary)">
                {def.name}
              </label>
              {renderField(def.fieldType, fieldValue, opts, slug, handleFieldChange, __, fieldRenderers)}
            </div>
          );
        })}
      </div>

      {saveValues.isPending && (
        <div className="custom-fields-saving mt-3 flex items-center gap-2 text-xs text-(--text-muted)">
          <Loader2 className="h-3 w-3 animate-spin" />
          {__('Saving custom fields...')}
        </div>
      )}
    </div>
  );
});

const INPUT_CLASS = 'input mt-1';
const TEXTAREA_CLASS = 'textarea mt-1';
const SELECT_CLASS = 'select mt-1 w-full';

// ---------------------------------------------------------------------------
// Built-in field renderers — extensible via `fieldRenderers` prop
// ---------------------------------------------------------------------------

const DEFAULT_FIELD_RENDERERS: Record<string, FieldRenderer> = {
  text: ({ value, slug, onChange }) => (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(slug, e.target.value)}
      className={INPUT_CLASS}
    />
  ),

  textarea: ({ value, slug, onChange }) => (
    <textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(slug, e.target.value)}
      rows={3}
      className={TEXTAREA_CLASS}
    />
  ),

  number: ({ value, slug, onChange }) => (
    <input
      type="number"
      value={(value as number) ?? ''}
      onChange={(e) =>
        onChange(slug, e.target.value === '' ? null : Number(e.target.value))
      }
      className={INPUT_CLASS + ' w-48'}
    />
  ),

  boolean: ({ value, slug, onChange, __ }) => (
    <label className="mt-1 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(slug, e.target.checked)}
        className="rounded border-(--border-primary)"
      />
      {__('Enabled')}
    </label>
  ),

  select: ({ value, options, slug, onChange, __ }) => {
    const choices = (options?.choices as string[]) ?? [];
    return (
      <select
        value={(value as string) ?? ''}
        onChange={(e) => onChange(slug, e.target.value || null)}
        className={SELECT_CLASS}
      >
        <option value="">{__('-- Select --')}</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  },

  date: ({ value, slug, onChange }) => (
    <input
      type="date"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(slug, e.target.value || null)}
      className={INPUT_CLASS + ' w-48'}
    />
  ),

  url: ({ value, slug, onChange }) => (
    <input
      type="url"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(slug, e.target.value)}
      className={INPUT_CLASS}
      placeholder="https://"
    />
  ),

  color: ({ value, slug, onChange }) => (
    <div className="custom-fields-color-picker mt-1 flex items-center gap-2">
      <input
        type="color"
        value={(value as string) || '#000000'}
        onChange={(e) => onChange(slug, e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-(--border-primary)"
      />
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(slug, e.target.value)}
        className={INPUT_CLASS + ' w-32'}
        placeholder="#000000"
      />
    </div>
  ),
};

function renderField(
  fieldType: string,
  value: unknown,
  options: Record<string, unknown> | null,
  slug: string,
  onChange: (slug: string, value: unknown) => void,
  __: (key: string) => string,
  overrides?: Record<string, FieldRenderer>,
) {
  const renderers = overrides
    ? { ...DEFAULT_FIELD_RENDERERS, ...overrides }
    : DEFAULT_FIELD_RENDERERS;
  const render = renderers[fieldType] ?? renderers.text!;
  return render({ value, options, slug, onChange, __ });
}
