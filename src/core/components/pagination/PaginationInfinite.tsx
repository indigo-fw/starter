'use client';

import { useEffect, useRef } from 'react';

interface PaginationInfiniteProps {
  /** Whether more items are available */
  hasMore: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Called when the sentinel element enters the viewport */
  onLoadMore: () => void;
  /** IntersectionObserver rootMargin — how far before the bottom to trigger (default: '200px') */
  rootMargin?: string;
  /** Loading indicator */
  loadingLabel?: string;
  /** CSS class for the wrapper */
  className?: string;
}

/**
 * Infinite scroll pagination — auto-loads next page when user scrolls near bottom.
 * Uses IntersectionObserver (no scroll event listeners).
 *
 * Place at the bottom of your list:
 * ```tsx
 * {items.map(item => <Card key={item.id} />)}
 * <PaginationInfinite hasMore={hasMore} isLoading={isFetching} onLoadMore={fetchNext} />
 * ```
 */
export function PaginationInfinite({
  hasMore,
  isLoading,
  onLoadMore,
  rootMargin = '200px',
  loadingLabel = 'Loading...',
  className,
}: PaginationInfiniteProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, rootMargin]);

  if (!hasMore && !isLoading) return null;

  return (
    <div ref={sentinelRef} className={className} aria-hidden="true">
      {isLoading && (
        <div className="pagination">
          <span className="pagination-info">{loadingLabel}</span>
        </div>
      )}
    </div>
  );
}
