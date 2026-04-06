'use client';

import { useEffect } from 'react';
import Link from 'next/link';

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

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Application error:', error);

    // Ensure dark mode is applied (error boundary may render before layout script)
    const key = location.pathname.startsWith('/dashboard')
      ? 'indigo-theme-admin'
      : 'indigo-theme-public';
    const theme = localStorage.getItem(key) || localStorage.getItem('indigo-theme');
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ||
      (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [error]);

  const isConnection = isConnectionError(error);

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
          {isConnection ? 'Connection Error' : 'Something went wrong'}
        </h2>

        <p className="mt-2 text-sm text-(--text-secondary)">
          {isConnection
            ? 'There was a problem connecting to the server. Please check your connection and try again.'
            : 'An unexpected error occurred. Please try again or contact support if the problem persists.'}
        </p>

        {error.digest && (
          <p className="mt-2 text-xs text-(--text-muted)">Error ID: {error.digest}</p>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--gradient-brand)' }}
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-md border border-(--border-primary) bg-(--surface-primary) px-4 py-2 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary)"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
