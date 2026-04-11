'use client';

import type { ComponentType } from 'react';
import type { PaginationState, PaginationNav, PaginationLinkProps } from './types';

interface PaginationSimpleProps extends PaginationState, PaginationNav {
  /** Custom link component (default: <a>) */
  LinkComponent?: ComponentType<PaginationLinkProps>;
  /** Labels — pass translated strings */
  labels?: {
    previous?: string;
    next?: string;
    pageInfo?: (page: number, totalPages: number) => string;
  };
  /** CSS class for the wrapper */
  className?: string;
}

/**
 * Simple prev/next pagination with "Page X of Y" info.
 * Matches the pattern already used across the project.
 *
 * Renders: [Previous] Page 3 of 10 [Next]
 */
export function PaginationSimple({
  page,
  totalPages,
  href: hrefBuilder,
  onPageChange,
  LinkComponent,
  labels,
  className,
}: PaginationSimpleProps) {
  if (totalPages <= 1) return null;

  const prevLabel = labels?.previous ?? 'Previous';
  const nextLabel = labels?.next ?? 'Next';
  const pageInfo = labels?.pageInfo
    ? labels.pageInfo(page, totalPages)
    : `Page ${page} of ${totalPages}`;

  const renderButton = (p: number, children: React.ReactNode, cls: string) => {
    if (hrefBuilder) {
      const Link = LinkComponent ?? DefaultLink;
      return <Link href={hrefBuilder(p)} className={cls}>{children}</Link>;
    }
    return (
      <button type="button" className={cls} onClick={() => onPageChange?.(p)}>
        {children}
      </button>
    );
  };

  return (
    <div className={`pagination ${className ?? ''}`}>
      {page > 1 && renderButton(page - 1, prevLabel, 'pagination-btn')}
      <span className="pagination-info">{pageInfo}</span>
      {page < totalPages && renderButton(page + 1, nextLabel, 'pagination-btn')}
    </div>
  );
}

function DefaultLink({ href, className, children }: PaginationLinkProps) {
  return <a href={href} className={className}>{children}</a>;
}
