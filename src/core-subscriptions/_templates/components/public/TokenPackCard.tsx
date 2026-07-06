'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/translations';

export interface TokenPackCardPack {
  id: string;
  name: string;
  description?: string;
  tokens: number;
  priceCents: number;
  popular?: boolean;
}

/** '$9' for whole dollars, '$9.50' otherwise — same price everywhere. */
export function formatPackPrice(priceCents: number): string {
  return priceCents % 100 === 0
    ? `$${(priceCents / 100).toFixed(0)}`
    : `$${(priceCents / 100).toFixed(2)}`;
}

/**
 * One token pack, rendered identically on the public pricing page and the
 * account billing page. The caller supplies the action (register link or
 * buy button) via `action`.
 */
export function TokenPackCard({ pack, action }: { pack: TokenPackCardPack; action: ReactNode }) {
  const __ = useTranslations();

  return (
    <div
      className={cn(
        'rounded-xl border p-6 flex flex-col text-center',
        pack.popular ? 'border-brand-500 shadow-lg' : 'border-(--border-primary)',
      )}
    >
      {pack.popular && (
        <span className="self-center mb-3 text-xs rounded-full bg-brand-500 text-white px-3 py-1">
          {__('Most popular')}
        </span>
      )}
      <h2 className="font-semibold text-lg">{pack.name}</h2>
      <p className="text-3xl font-bold mt-2">{formatPackPrice(pack.priceCents)}</p>
      <p className="text-(--text-secondary) mt-1">
        {pack.tokens.toLocaleString()} {__('tokens')}
      </p>
      {pack.description && (
        <p className="text-sm text-(--text-secondary) mt-2">{pack.description}</p>
      )}
      <div className="mt-6 flex flex-col">{action}</div>
    </div>
  );
}
