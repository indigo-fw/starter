'use client';

import type { ComponentType } from 'react';
import type { PaginationState, PaginationNav, PaginationLinkProps } from './types';

interface PaginationNumberedProps extends PaginationState, PaginationNav {
  /** Max page buttons to show (default: 7). Odd numbers work best. */
  maxButtons?: number;
  /** Custom link component (default: <a>) */
  LinkComponent?: ComponentType<PaginationLinkProps>;
  /** Labels — pass translated strings */
  labels?: {
    previous?: string;
    next?: string;
    page?: string;
  };
  /** CSS class for the wrapper */
  className?: string;
}

/**
 * Numbered pagination with prev/next and page buttons.
 * Supports both href (SSR) and onPageChange (client) navigation.
 *
 * Renders: [Prev] [1] ... [4] [5] [6] ... [10] [Next]
 */
export function PaginationNumbered({
  page,
  totalPages,
  maxButtons = 7,
  href: hrefBuilder,
  onPageChange,
  LinkComponent,
  labels,
  className,
}: PaginationNumberedProps) {
  if (totalPages <= 1) return null;

  const prevLabel = labels?.previous ?? 'Previous';
  const nextLabel = labels?.next ?? 'Next';
  const pageLabel = labels?.page ?? 'Page';
  const pages = buildPageNumbers(page, totalPages, maxButtons);

  const renderButton = (p: number, children: React.ReactNode, cls: string, ariaLabel?: string) => {
    if (hrefBuilder) {
      const Link = LinkComponent ?? DefaultLink;
      return <Link href={hrefBuilder(p)} className={cls}>{children}</Link>;
    }
    return (
      <button type="button" className={cls} onClick={() => onPageChange?.(p)} aria-label={ariaLabel}>
        {children}
      </button>
    );
  };

  return (
    <nav className={`pagination ${className ?? ''}`} aria-label="Pagination">
      {page > 1
        ? renderButton(page - 1, prevLabel, 'pagination-btn')
        : <span className="pagination-btn" aria-disabled="true">{prevLabel}</span>
      }

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="pagination-ellipsis">&hellip;</span>
        ) : (
          renderButton(
            p as number,
            p,
            `pagination-btn ${p === page ? 'is-active' : ''}`,
            `${pageLabel} ${p}`,
          )
        ),
      )}

      {page < totalPages
        ? renderButton(page + 1, nextLabel, 'pagination-btn')
        : <span className="pagination-btn" aria-disabled="true">{nextLabel}</span>
      }
    </nav>
  );
}

function buildPageNumbers(current: number, total: number, max: number): (number | '...')[] {
  if (total <= max) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];
  const sideCount = Math.floor((max - 3) / 2);

  pages.push(1);

  const startPage = Math.max(2, current - sideCount);
  const endPage = Math.min(total - 1, current + sideCount);

  if (startPage > 2) pages.push('...');
  for (let i = startPage; i <= endPage; i++) pages.push(i);
  if (endPage < total - 1) pages.push('...');

  pages.push(total);
  return pages;
}

function DefaultLink({ href, className, children }: PaginationLinkProps) {
  return <a href={href} className={className}>{children}</a>;
}
