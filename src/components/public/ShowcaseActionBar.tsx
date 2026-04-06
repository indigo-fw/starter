'use client';

import { ThumbsUp, ThumbsDown, MessageCircle, Share2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';
import { toast } from '@/store/toast-store';
import { useTranslations } from '@/lib/translations';

interface Props {
  itemId: string;
  itemSlug: string;
  contentType: string;
  likes: number;
  dislikes: number;
  commentCount: number;
  userReaction: 'like' | 'dislike' | null;
  onCommentClick: () => void;
  /** All item IDs in the feed — needed to match batch query cache key */
  allItemIds: string[];
}

export function ShowcaseActionBar({
  itemId,
  itemSlug,
  contentType,
  likes,
  dislikes: _dislikes,
  commentCount,
  userReaction,
  onCommentClick,
  allItemIds,
}: Props) {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const __ = useTranslations();

  const toggleReaction = trpc.reactions.toggle.useMutation({
    onMutate: async ({ reactionType }) => {
      const batchKey = { contentType, contentIds: allItemIds };
      await utils.reactions.getBatchCounts.cancel(batchKey);
      await utils.reactions.getUserBatchReactions.cancel(batchKey);

      const prevCounts = utils.reactions.getBatchCounts.getData(batchKey);
      const prevUserReactions = utils.reactions.getUserBatchReactions.getData(batchKey);

      utils.reactions.getBatchCounts.setData(batchKey, (old) => {
        if (!old) return old;
        const entry = { ...(old[itemId] ?? { likes: 0, dislikes: 0 }) };
        if (userReaction === reactionType) {
          if (reactionType === 'like') entry.likes = Math.max(0, entry.likes - 1);
          else entry.dislikes = Math.max(0, entry.dislikes - 1);
        } else {
          if (userReaction === 'like') entry.likes = Math.max(0, entry.likes - 1);
          else if (userReaction === 'dislike') entry.dislikes = Math.max(0, entry.dislikes - 1);
          if (reactionType === 'like') entry.likes += 1;
          else entry.dislikes += 1;
        }
        return { ...old, [itemId]: entry };
      });

      utils.reactions.getUserBatchReactions.setData(batchKey, (old) => {
        if (!old) return old;
        const copy = { ...old };
        if (userReaction === reactionType) {
          delete copy[itemId];
        } else {
          copy[itemId] = reactionType;
        }
        return copy;
      });

      return { prevCounts, prevUserReactions };
    },
    onError: (_err, _vars, context) => {
      const batchKey = { contentType, contentIds: allItemIds };
      if (context?.prevCounts) {
        utils.reactions.getBatchCounts.setData(batchKey, context.prevCounts);
      }
      if (context?.prevUserReactions) {
        utils.reactions.getUserBatchReactions.setData(batchKey, context.prevUserReactions);
      }
    },
    onSettled: () => {
      utils.reactions.getBatchCounts.invalidate();
      utils.reactions.getUserBatchReactions.invalidate();
    },
  });

  function handleReaction(type: 'like' | 'dislike') {
    if (!session) {
      toast.error(__('Sign in to react'));
      return;
    }
    toggleReaction.mutate({ contentType, contentId: itemId, reactionType: type });
  }

  function handleShare() {
    const url = `${window.location.origin}/showcase/${itemSlug}`;
    if (navigator.share) {
      navigator.share({ url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast.success(__('Link copied'));
    }
  }

  function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Like */}
      <button
        onClick={() => handleReaction('like')}
        className="group flex flex-col items-center gap-1"
      >
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full transition-all',
          userReaction === 'like'
            ? 'bg-white/25 text-white'
            : 'bg-white/10 text-white/80 hover:bg-white/20'
        )}>
          <ThumbsUp className={cn('h-6 w-6', userReaction === 'like' && 'fill-current')} />
        </div>
        <span className="text-xs font-semibold text-white drop-shadow">
          {likes > 0 ? formatCount(likes) : ''}
        </span>
      </button>

      {/* Dislike */}
      <button
        onClick={() => handleReaction('dislike')}
        className="group flex flex-col items-center gap-1"
      >
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full transition-all',
          userReaction === 'dislike'
            ? 'bg-white/25 text-white'
            : 'bg-white/10 text-white/80 hover:bg-white/20'
        )}>
          <ThumbsDown className={cn('h-6 w-6', userReaction === 'dislike' && 'fill-current')} />
        </div>
      </button>

      {/* Comments */}
      <button
        onClick={onCommentClick}
        className="group flex flex-col items-center gap-1"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/20">
          <MessageCircle className="h-6 w-6" />
        </div>
        <span className="text-xs font-semibold text-white drop-shadow">
          {commentCount > 0 ? formatCount(commentCount) : ''}
        </span>
      </button>

      {/* Share */}
      <button
        onClick={handleShare}
        className="group flex flex-col items-center gap-1"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 transition-all hover:bg-white/20">
          <Share2 className="h-6 w-6" />
        </div>
      </button>
    </div>
  );
}
