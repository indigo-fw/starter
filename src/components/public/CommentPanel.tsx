'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Loader2, Send, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';
import { formatRelativeTime } from '@/core/lib/datetime';
import { toast } from '@/store/toast-store';
import { useTranslations } from '@/lib/translations';

interface Props {
  contentType: string;
  contentId: string | null;
  onClose: () => void;
}

function UserAvatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name}
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        unoptimized
      />
    );
  }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
      {initials}
    </div>
  );
}

interface CommentItemProps {
  comment: {
    id: string;
    body: string;
    createdAt: Date;
    userId: string;
    userName: string;
    userImage: string | null;
    replyCount?: number;
  };
  currentUserId: string | null;
  contentType: string;
  contentId: string;
  depth?: number;
}

function CommentItem({ comment, currentUserId, contentType, contentId, depth = 0 }: CommentItemProps) {
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const utils = trpc.useUtils();
  const __ = useTranslations();

  const replies = trpc.comments.listReplies.useQuery(
    { parentId: comment.id, pageSize: 50 },
    { enabled: showReplies }
  );

  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      setReplyText('');
      setReplying(false);
      setShowReplies(true);
      utils.comments.listReplies.invalidate({ parentId: comment.id });
      utils.comments.list.invalidate({ contentType, contentId });
      utils.comments.batchCounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ contentType, contentId });
      utils.comments.listReplies.invalidate();
      utils.comments.batchCounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleReplySubmit() {
    if (!replyText.trim()) return;
    createComment.mutate({
      contentType,
      contentId,
      parentId: comment.id,
      body: replyText.trim(),
    });
  }

  const isOwn = currentUserId === comment.userId;
  const replyCount = comment.replyCount ?? 0;

  return (
    <div className={cn('flex gap-3', depth > 0 && 'ml-10')}>
      <UserAvatar name={comment.userName} image={comment.userImage} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white">{comment.userName}</span>
          <span className="text-xs text-white/50">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-white/85">{comment.body}</p>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-white/50">
          {currentUserId && depth === 0 && (
            <button
              onClick={() => setReplying(!replying)}
              className="font-medium hover:text-white/80"
            >
              {__('Reply')}
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => deleteComment.mutate({ id: comment.id })}
              className="font-medium hover:text-red-400"
            >
              {__('Delete')}
            </button>
          )}
        </div>

        {/* Reply input */}
        {replying && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReplySubmit(); } }}
              placeholder={__('Reply...')}
              maxLength={2000}
              className="flex-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40 outline-none focus:bg-white/15"
            />
            <button
              onClick={handleReplySubmit}
              disabled={!replyText.trim() || createComment.isPending}
              className="rounded-full bg-white/15 p-1.5 text-white transition hover:bg-white/25 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Show/hide replies */}
        {replyCount > 0 && depth === 0 && (
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showReplies && 'rotate-180')} />
            {showReplies ? __('Hide') : `${replyCount}`} {__._n('reply', 'replies', replyCount)}
          </button>
        )}

        {/* Replies list */}
        {showReplies && replies.data && (
          <div className="mt-2 space-y-3">
            {replies.data.results.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                contentType={contentType}
                contentId={contentId}
                depth={1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentPanel({ contentType, contentId, onClose }: Props) {
  const { data: session } = useSession();
  const [newComment, setNewComment] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const __ = useTranslations();

  // Animation state machine: enter/exit transitions
  // We track "phase" to manage the slide-up/slide-down lifecycle
  const [phase, setPhase] = useState<'closed' | 'entering' | 'open' | 'exiting'>('closed');
  const [activeId, setActiveId] = useState<string | null>(null);

  const isOpen = contentId !== null;
  const displayId = activeId ?? contentId;
  const visible = phase === 'open';

  // Enter/exit: adjust state when contentId prop changes (React docs pattern)
  const [prevContentId, setPrevContentId] = useState(contentId);
  if (prevContentId !== contentId) {
    setPrevContentId(contentId);
    if (isOpen && contentId && phase === 'closed') {
      setActiveId(contentId);
      setPhase('entering');
    } else if (!isOpen && (phase === 'open' || phase === 'entering')) {
      setPhase('exiting');
    }
  }

  // Trigger slide-up animation frame after entering (genuine DOM side-effect)
  useEffect(() => {
    if (phase === 'entering') {
      const frameId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('open'));
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [phase]);

  // Exit: clear activeId after slide-down transition completes
  useEffect(() => {
    if (phase === 'exiting') {
      const timer = setTimeout(() => {
        setActiveId(null);
        setPhase('closed');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const comments = trpc.comments.list.useQuery(
    { contentType, contentId: displayId!, pageSize: 50 },
    { enabled: !!displayId }
  );

  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => {
      setNewComment('');
      if (displayId) {
        utils.comments.list.invalidate({ contentType, contentId: displayId });
      }
      utils.comments.batchCounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit() {
    if (!newComment.trim() || !displayId) return;
    createComment.mutate({
      contentType,
      contentId: displayId,
      body: newComment.trim(),
    });
  }

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Nothing to show
  if (!activeId) return null;

  const totalComments = comments.data?.total ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/50 transition-opacity duration-300',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-2xl bg-[oklch(0.15_0.01_260)] transition-transform duration-300 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 pb-3">
          <h3 className="text-base font-semibold text-white">
            {__('Comments')}{totalComments > 0 && ` ${totalComments}`}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {comments.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : comments.data?.results.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/40">
              {__('No comments yet. Be the first!')}
            </p>
          ) : (
            <div className="space-y-4">
              {comments.data?.results.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={session?.user?.id ?? null}
                  contentType={contentType}
                  contentId={activeId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-white/10 px-4 py-3">
          {session ? (
            <div className="flex items-center gap-2">
              <UserAvatar
                name={session.user.name ?? 'You'}
                image={session.user.image ?? null}
              />
              <input
                ref={inputRef}
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder={__('Add a comment...')}
                maxLength={2000}
                className="flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 outline-none focus:bg-white/15"
              />
              <button
                onClick={handleSubmit}
                disabled={!newComment.trim() || createComment.isPending}
                className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25 disabled:opacity-40"
              >
                {createComment.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-white/50">
              <Link href="/login" className="font-medium text-blue-400 hover:text-blue-300">
                {__('Sign in')}
              </Link>
              {' '}{__('to comment')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
