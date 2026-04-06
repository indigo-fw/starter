import Link from 'next/link';

import { cn } from '@/lib/utils';

const STAT_BG = {
  blue: 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)]',
  green: 'bg-green-50 dark:bg-green-500/15',
  purple: 'bg-purple-50 dark:bg-purple-500/15',
  orange: 'bg-orange-50 dark:bg-orange-500/15',
} as const;

const STAT_TEXT = {
  blue: 'text-brand-600 dark:text-brand-400',
  green: 'text-green-600 dark:text-green-400',
  purple: 'text-purple-600 dark:text-purple-400',
  orange: 'text-orange-600 dark:text-orange-400',
} as const;

export type StatColor = keyof typeof STAT_BG;

export default function StatCard({
  label,
  count,
  href,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  count: number | undefined;
  href: string;
  icon: React.ElementType;
  color?: StatColor;
}) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn('stat-card-icon rounded-lg p-2', STAT_BG[color])}>
          <Icon className={cn('h-5 w-5', STAT_TEXT[color])} />
        </div>
        <div className="stat-card-text">
          <p className="text-sm font-medium text-(--text-muted)">{label}</p>
          <p className="stat-card-count mt-0.5 text-2xl font-semibold text-(--text-primary)">
            {count ?? '—'}
          </p>
        </div>
      </div>
    </Link>
  );
}
