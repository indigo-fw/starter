import type { ReactNode } from 'react';

/** Shared pagination state — all variants use this. */
export interface PaginationState {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items (optional, for display) */
  totalItems?: number;
  /** Items per page (optional, for display) */
  pageSize?: number;
}

/**
 * How to navigate pages.
 * - Pass `href` for SSR-friendly link-based pagination.
 * - Pass `onPageChange` for client-side SPA navigation.
 * - Both can be provided (href for SSR, onPageChange for client enhancement).
 */
export interface PaginationNav {
  /** Build href for page N (renders <a> tags for SSR) */
  href?: (page: number) => string;
  /** Client-side page change callback */
  onPageChange?: (page: number) => void;
}

/** Custom link component — project can pass its own Link (e.g. typed i18n Link). */
export interface PaginationLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}
