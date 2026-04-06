'use client';

interface DateSeparatorProps {
  date: string;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const formatted = formatDate(date);
  if (!formatted) return null;

  return (
    <div className="flex items-center justify-center py-3">
      <span className="text-[11px] text-(--text-tertiary) bg-(--surface-secondary) px-3 py-1 rounded-full">
        {formatted}
      </span>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Check if two date strings are on different days */
export function isDifferentDay(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  try {
    const da = new Date(a).toDateString();
    const db = new Date(b).toDateString();
    return da !== db;
  } catch {
    return false;
  }
}
