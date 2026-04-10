'use client';

import { useMemo } from 'react';
import { markdownToHtml } from '@/core/lib/markdown/markdown';

interface Props {
  content: string;
  className?: string;
}

/**
 * Renders markdown content as HTML preview in a prose container.
 * Used in side-by-side editor preview mode.
 */
export function LivePreview({ content, className }: Props) {
  const html = useMemo(() => {
    if (!content) return '';
    return markdownToHtml(content);
  }, [content]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
