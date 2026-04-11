'use client';

import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { CHARACTER_GENDER, CHARACTER_PERSONALITY } from '@/core-chat/lib/character/character-enums';
import { X } from 'lucide-react';

interface FilterCounts {
  genders: Array<{ id: number | null; count: number }>;
  ethnicities: Array<{ id: number | null; count: number }>;
  personalities: Array<{ id: number | null; count: number }>;
}

interface Filters {
  genderId?: number;
  ethnicityId?: number;
  personalityId?: number;
}

interface CharacterFilterBarProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  counts?: FilterCounts;
}

export function CharacterFilterBar({ filters, onFilterChange, counts }: CharacterFilterBarProps) {
  const __ = useBlankTranslations();

  const hasFilters = filters.genderId || filters.ethnicityId || filters.personalityId;

  function toggle(key: keyof Filters, value: number) {
    onFilterChange({
      ...filters,
      [key]: filters[key] === value ? undefined : value,
    });
  }

  function getCount(type: 'genders' | 'ethnicities' | 'personalities', id: number): number | null {
    const item = counts?.[type].find((c) => c.id === id);
    return item?.count ?? null;
  }

  return (
    <div className="space-y-3">
      {/* Gender */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-(--text-tertiary) w-16 shrink-0">{__('Gender')}</span>
        {[...CHARACTER_GENDER.values()].map((g) => {
          const count = getCount('genders', g.id);
          return (
            <FilterPill
              key={g.id}
              label={g.title}
              count={count}
              active={filters.genderId === g.id}
              onClick={() => toggle('genderId', g.id)}
            />
          );
        })}
      </div>

      {/* Personality */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-(--text-tertiary) w-16 shrink-0">{__('Type')}</span>
        {[...CHARACTER_PERSONALITY.values()].map((p) => {
          const count = getCount('personalities', p.id);
          return (
            <FilterPill
              key={p.id}
              label={p.title}
              count={count}
              active={filters.personalityId === p.id}
              onClick={() => toggle('personalityId', p.id)}
            />
          );
        })}
      </div>

      {/* Reset */}
      {hasFilters && (
        <button
          onClick={() => onFilterChange({})}
          className="flex items-center gap-1 text-xs text-(--text-tertiary) hover:text-(--text-primary) transition-colors"
        >
          <X size={12} />
          {__('Reset filters')}
        </button>
      )}
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: {
  label: string; count: number | null; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-brand-500/10 text-brand-500 border-brand-500/30'
          : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent hover:border-(--border-primary)',
      )}
    >
      {label}
      {count != null && <span className="ml-1 opacity-60">{count}</span>}
    </button>
  );
}
