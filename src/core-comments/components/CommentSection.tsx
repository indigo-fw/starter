'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { CommentForm } from './CommentForm';
import { CommentItem } from './CommentItem';
import '../styles/comments.css';

interface CommentSectionProps {
  targetType: string;
  targetId: string;
}

export function CommentSection({ targetType, targetId }: CommentSectionProps) {
  const __ = useBlankTranslations();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const { data: commentsData, isLoading } = trpc.comments.list.useQuery({
    targetType,
    targetId,
    limit: 50,
  });

  const { data: count } = trpc.comments.count.useQuery({ targetType, targetId });

  const items = commentsData?.items ?? [];

  // Build thread tree: group replies by parentId
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: typeof items = [];
    const byParent = new Map<string, typeof items>();

    for (const item of items) {
      if (!item.parentId) {
        top.push(item);
      } else {
        const list = byParent.get(item.parentId) ?? [];
        list.push(item);
        byParent.set(item.parentId, list);
      }
    }

    return { topLevel: top, repliesByParent: byParent };
  }, [items]);

  // Recursively collect nested replies for a comment
  function getReplies(parentId: string): typeof items {
    const direct = repliesByParent.get(parentId) ?? [];
    const result: typeof items = [];
    for (const reply of direct) {
      result.push(reply);
      const nested = getReplies(reply.id);
      result.push(...nested);
    }
    return result;
  }

  return (
    <section className="comment-section">
      <h3 className="comment-section-header">
        {__('Comments')}
        {count !== undefined && (
          <span className="comment-count">
            ({count === 1 ? `1 ${__('comment')}` : `${count} ${__('comments')}`})
          </span>
        )}
      </h3>

      {currentUserId ? (
        <CommentForm targetType={targetType} targetId={targetId} />
      ) : (
        <div className="comment-login-prompt">
          {__('Sign in to leave a comment.')}
        </div>
      )}

      {isLoading ? (
        <div className="comment-empty">{__('Loading comments...')}</div>
      ) : topLevel.length === 0 ? (
        <div className="comment-empty">{__('No comments yet. Be the first to comment!')}</div>
      ) : (
        <div className="comment-list">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              targetType={targetType}
              targetId={targetId}
              currentUserId={currentUserId}
              replies={getReplies(comment.id)}
              depth={0}
            />
          ))}
        </div>
      )}
    </section>
  );
}
