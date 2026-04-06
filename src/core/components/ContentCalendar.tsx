'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/translations';
import { ContentStatus } from '@/core/types/cms';
import { cn } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_CHIP: Record<number, string> = {
  [ContentStatus.PUBLISHED]: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  [ContentStatus.SCHEDULED]: 'bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400',
  [ContentStatus.DRAFT]: 'bg-(--surface-secondary) text-(--text-secondary)',
};

/**
 * Maps a calendar event to its admin section slug.
 * Accepts contentType string and optional postType number.
 * Returns the admin slug (e.g. 'blog', 'pages', 'categories').
 */
type SectionResolver = (contentType: string, postType?: number | null) => string;

interface ContentCalendarProps {
  editUrlBuilder?: (section: string, id: string) => string;
  /** Resolve admin section slug from contentType + postType. Falls back to contentType. */
  resolveSection?: SectionResolver;
}

export function ContentCalendar({ editUrlBuilder, resolveSection }: ContentCalendarProps) {
  const __ = useAdminTranslations();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const events = trpc.cms.calendarEvents.useQuery({ month, year });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Group events by day
  const eventsByDay = new Map<number, NonNullable<typeof events.data>>();
  if (events.data) {
    for (const ev of events.data) {
      if (!ev.publishedAt) continue;
      const d = new Date(ev.publishedAt).getDate();
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      const arr = eventsByDay.get(d);
      if (arr) arr.push(ev);
    }
  }

  // Resolve admin edit URL
  function getEditUrl(ev: NonNullable<typeof events.data>[number]): string | null {
    if (!editUrlBuilder) return null;
    const section = resolveSection
      ? resolveSection(ev.contentType, ev.type)
      : ev.contentType;
    return editUrlBuilder(section, ev.id);
  }

  const isToday = (day: number) =>
    day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div className="calendar">
      {/* Month navigation */}
      <div className="calendar-header flex items-center justify-between">
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Calendar')}</h1>
        <div className="calendar-nav flex items-center gap-3">
          <button onClick={prevMonth} className="btn btn-secondary">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-(--text-primary) min-w-[140px] text-center">
            {__(MONTHS[month - 1]!)} {year}
          </span>
          <button onClick={nextMonth} className="btn btn-secondary">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card mt-4 overflow-hidden">
        {events.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (
          <>
            {/* Day headers */}
            <div className="calendar-day-headers grid grid-cols-7 border-b border-(--border-primary)">
              {DAYS.map(day => (
                <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-(--text-muted)">
                  {__(day)}
                </div>
              ))}
            </div>
            {/* Day cells */}
            <div className="calendar-grid grid grid-cols-7">
              {cells.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    'min-h-[100px] border-b border-r border-(--border-primary) p-1.5',
                    !day && 'bg-(--surface-secondary)/50'
                  )}
                >
                  {day && (
                    <>
                      <span className={cn(
                        'inline-flex items-center justify-center text-xs font-medium mb-1',
                        isToday(day)
                          ? 'rounded-full bg-brand-600 text-(--text-inverse) w-5 h-5'
                          : 'text-(--text-muted)'
                      )}>
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {(eventsByDay.get(day) ?? []).slice(0, 3).map(ev => {
                          const href = getEditUrl(ev);
                          const chipClass = cn(
                            'block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight',
                            STATUS_CHIP[ev.status] ?? 'bg-(--surface-secondary) text-(--text-secondary)'
                          );
                          return href ? (
                            <Link
                              key={`${ev.contentType}-${ev.id}`}
                              href={href}
                              className={chipClass}
                              title={ev.title}
                            >
                              {ev.title}
                            </Link>
                          ) : (
                            <span
                              key={`${ev.contentType}-${ev.id}`}
                              className={chipClass}
                              title={ev.title}
                            >
                              {ev.title}
                            </span>
                          );
                        })}
                        {(eventsByDay.get(day)?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-(--text-muted) px-1">
                            +{(eventsByDay.get(day)?.length ?? 0) - 3} {__('more')}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
