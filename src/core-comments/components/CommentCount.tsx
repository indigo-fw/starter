'use client';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';

interface CommentCountProps {
  targetType: string;
  targetId: string;
  className?: string;
}

export function CommentCount({ targetType, targetId, className }: CommentCountProps) {
  const __ = useBlankTranslations();
  const { data: count } = trpc.comments.count.useQuery({ targetType, targetId });

  if (count === undefined) return null;

  return (
    <span className={className ?? 'comment-count'}>
      {count === 1 ? `1 ${__('comment')}` : `${count} ${__('comments')}`}
    </span>
  );
}
