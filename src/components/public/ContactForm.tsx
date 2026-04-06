'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/translations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string;
}

interface ContactFormProps {
  formSlug: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContactForm({ formSlug, className }: ContactFormProps) {
  const __ = useTranslations();
  const formQuery = trpc.forms.getBySlug.useQuery({ slug: formSlug });

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = formQuery.data;
  const fields = form
    ? (form.fields as FormField[])
    : [];

  function handleChange(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    setSubmitting(true);
    setError(null);

    try {
      // Build payload — include honeypot field value if defined
      const payload: Record<string, string> = { ...values };

      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Submission failed');
        return;
      }

      setSubmitted(true);
    } catch {
      setError(__('Network error. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (formQuery.isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (formQuery.isError || !form) {
    return null; // Silently hide if form not found
  }

  // Success state
  if (submitted) {
    return (
      <div className={cn('contact-form-success rounded-lg border p-8 text-center', className)}>
        <p className="text-lg font-medium">{form.successMessage}</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render form
  // ---------------------------------------------------------------------------

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('contact-form space-y-4', className)}
      noValidate
    >
      {fields.map((field) => (
        <div key={field.id} className="contact-form-field">
          <label className="mb-1 block text-sm font-medium">
            {field.label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>

          {field.type === 'textarea' ? (
            <textarea
              value={values[field.id] ?? ''}
              onChange={(e) => handleChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
              className="textarea"
            />
          ) : field.type === 'select' ? (
            <select
              value={values[field.id] ?? ''}
              onChange={(e) => handleChange(field.id, e.target.value)}
              required={field.required}
              className="select w-full"
            >
              <option value="">
                {field.placeholder ?? __('Select...')}
              </option>
              {(field.options ?? '')
                .split(',')
                .map((opt) => opt.trim())
                .filter(Boolean)
                .map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
            </select>
          ) : field.type === 'checkbox' ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values[field.id] === 'true'}
                onChange={(e) =>
                  handleChange(field.id, e.target.checked ? 'true' : 'false')
                }
                required={field.required}
                className="h-4 w-4 rounded"
              />
              {field.placeholder}
            </label>
          ) : (
            <input
              type={
                field.type === 'email'
                  ? 'email'
                  : field.type === 'number'
                    ? 'number'
                    : field.type === 'phone'
                      ? 'tel'
                      : field.type === 'date'
                        ? 'date'
                        : 'text'
              }
              value={values[field.id] ?? ''}
              onChange={(e) => handleChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              className="input"
            />
          )}
        </div>
      ))}

      {/* Honeypot field — hidden from real users */}
      {form.honeypotField && (
        <div
          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
          aria-hidden="true"
        >
          <input
            type="text"
            name={form.honeypotField}
            value={values[form.honeypotField] ?? ''}
            onChange={(e) => handleChange(form.honeypotField!, e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary rounded-md px-6 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {__('Submitting...')}
          </span>
        ) : (
          __('Submit')
        )}
      </button>
    </form>
  );
}
