'use client';

import type { ReactNode } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityFeed } from './ActivityFeed';

interface UseAdminActivityFeedOptions {
  filters: {
    action?: string;
    actorId?: string;
    targetType?: string;
  };
  page: number;
  pageSize: number;
}

interface UseAdminActivityFeedResult {
  feed: ReactNode;
  total: number;
  totalPages: number;
  isLoading: boolean;
}

/**
 * Hook that fetches admin activity feed data and returns a rendered ActivityFeed
 * along with pagination metadata.
 */
export function useAdminActivityFeed({
  filters,
  page,
  pageSize,
}: UseAdminActivityFeedOptions): UseAdminActivityFeedResult {
  const { data, isLoading } = trpc.activity.adminFeed.useQuery({
    action: filters.action || undefined,
    actorId: filters.actorId || undefined,
    targetType: filters.targetType || undefined,
    page,
    pageSize,
  });

  return {
    feed: (
      <ActivityFeed
        items={data?.results ?? []}
        loading={isLoading}
      />
    ),
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    isLoading,
  };
}
