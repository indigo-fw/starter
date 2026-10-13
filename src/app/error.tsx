'use client';

import { useEffect } from 'react';

// Deliberately raw next/link: `@/components/Link` pulls in next-intl + tRPC
// hooks, and this boundary must render even when those are what just broke.
import Link from 'next/link';

import { getLocalStorageItem } from '@/core/lib/storage/local-storage';
import { useBlankTranslations } from '@/lib/translations';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

function isConnectionError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('chunk') ||
    msg.includes('loading') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused')
  );
}

/**
 * A chunk that no longer exists on the server (the bundle changed under a
 * long-lived tab after a deploy). `reset()` re-renders the SAME stale bundle,
 * so the request fails again and "Try Again" loops forever; only a full
 * reload fetches the new manifest.
 */
function isStaleChunkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  return (
    name === 'chunkloaderror' ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('load failed')
  );
}

export default function GlobalError({ error, reset }: Props) {
  const __ = useBlankTranslations();

  useEffect(() => {
    console.error('Application error:', error);

    // Ensure dark mode is applied (error boundary may render before layout script)
    const key = location.pathname.startsWith('/dashboard')
      ? 'indigo-theme-admin'
      : 'indigo-theme-public';
    const theme =
      getLocalStorageItem(key) || getLocalStorageItem('indigo-theme');
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        matchMedia('(prefers-color-scheme: dark)').matches) ||
      (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [error]);

  const isConnection = isConnectionError(error);
  const needsReload = isStaleChunkError(error);

  const handleRetry = () => {
    if (needsReload) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--surface-secondary) p-4">
      <div className="w-full max-w-md rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-(--text-primary)">
          {isConnection ? __('Connection Error') : __('Something went wrong')}
        </h2>

        <p className="mt-2 text-sm text-(--text-secondary)">
          {needsReload
            ? __(
                'This page was updated. Please reload to get the latest version.'
              )
            : isConnection
              ? __(
                  'There was a problem connecting to the server. Please check your connection and try again.'
                )
              : __(
                  'An unexpected error occurred. Please try again or contact support if the problem persists.'
                )}
        </p>

        {error.digest && (
          <p className="mt-2 text-xs text-(--text-muted)">
            {__('Error ID: {digest}', { digest: error.digest })}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={handleRetry}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--gradient-brand)' }}
          >
            {needsReload ? __('Reload') : __('Try Again')}
          </button>
          <Link
            href="/"
            className="rounded-md border border-(--border-primary) bg-(--surface-primary) px-4 py-2 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary)"
          >
            {__('Go Home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
