import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--surface-secondary) p-4">
      <h1 className="text-6xl font-bold text-(--border-primary)">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-(--text-primary)">Page not found</h2>
      <p className="mt-2 text-sm text-(--text-secondary)">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--gradient-brand)' }}
        >
          Go Home
        </Link>
        <Link
          href="/blog"
          className="rounded-md border border-(--border-primary) bg-(--surface-primary) px-4 py-2 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary)"
        >
          Browse Blog
        </Link>
      </div>
    </div>
  );
}
