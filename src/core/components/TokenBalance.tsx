'use client';

import { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAdminTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/core/lib/realtime/ws-client';

interface TokenBalanceProps {
  /** Where clicking the badge navigates */
  href?: string;
}

interface TokenWsPayload {
  balance: number;
  orgId: string;
  timestamp: string;
}

export function TokenBalance({ href }: TokenBalanceProps) {
  const __ = useAdminTranslations();
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [prevBalance, setPrevBalance] = useState<number | null>(null);

  // Server resolves the org via resolveOrgId — no orgId prop needed
  const { data } = trpc.billing.getTokenBalance.useQuery();

  // Subscribe to WS using the orgId returned from the query
  const resolvedOrgId = data?.orgId;

  useChannel<Partial<TokenWsPayload>>(
    resolvedOrgId ? `org:${resolvedOrgId}` : '',
    (msg) => {
      if (typeof msg?.balance === 'number') {
        setLiveBalance(msg.balance);
      }
    },
  );

  const balance = liveBalance ?? data?.balance ?? 0;

  // Trigger animation when balance changes (adjust state during render — React docs pattern)
  if (prevBalance !== null && balance !== prevBalance && !animating) {
    setAnimating(true);
  }
  if (prevBalance !== balance) {
    setPrevBalance(balance);
  }

  // Clear animation after duration
  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 600);
    return () => clearTimeout(timer);
  }, [animating]);

  // Don't render until we have data (avoids flash of 0)
  if (!data) return null;

  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium',
        'bg-(--surface-secondary) hover:bg-(--surface-elevated)',
        'cursor-pointer transition-all duration-300',
        animating && 'scale-110',
      )}
      title={__('Token balance')}
    >
      <Coins className="h-4 w-4 text-amber-500" />
      <span className="tabular-nums">{balance.toLocaleString()}</span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
