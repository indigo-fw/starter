'use client';

interface PaginationLoadMoreProps {
  /** Whether more items are available */
  hasMore: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Called when user clicks "Load More" */
  onLoadMore: () => void;
  /** Button label */
  label?: string;
  /** Loading label */
  loadingLabel?: string;
  /** CSS class for the wrapper */
  className?: string;
}

/**
 * "Load More" button pagination — appends items to existing list.
 * Use for feeds, comments, social-style content.
 */
export function PaginationLoadMore({
  hasMore,
  isLoading,
  onLoadMore,
  label = 'Load More',
  loadingLabel = 'Loading...',
  className,
}: PaginationLoadMoreProps) {
  if (!hasMore && !isLoading) return null;

  return (
    <div className={`pagination ${className ?? ''}`}>
      <button
        type="button"
        className="pagination-btn"
        onClick={onLoadMore}
        disabled={isLoading}
      >
        {isLoading ? loadingLabel : label}
      </button>
    </div>
  );
}
