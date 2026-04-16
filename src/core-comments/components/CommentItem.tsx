'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { formatRelativeTime } from '@/core/lib/infra/datetime';
import { CommentForm } from './CommentForm';

interface CommentData {
  id: string;
  parentId: string | null;
  userId: string | null;
  authorName: string | null;
  content: string;
  createdAt: Date;
  userName: string | null;
  userImage: string | null;
}

interface CommentItemProps {
  comment: CommentData;
  targetType: string;
  targetId: string;
  currentUserId?: string;
  replies: CommentData[];
  depth: number;
}

const MAX_DEPTH = 3;

export function CommentItem({
  comment,
  targetType,
  targetId,
  currentUserId,
  replies,
  depth,
}: CommentItemProps) {
  const __ = useBlankTranslations();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const utils = trpc.useUtils();

  const updateMutation = trpc.comments.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.comments.list.invalidate({ targetType, targetId });
    },
  });

  const deleteMutation = trpc.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ targetType, targetId });
      utils.comments.count.invalidate({ targetType, targetId });
    },
  });

  const displayName = comment.userName ?? comment.authorName ?? __('Anonymous');
  const initial = displayName.charAt(0).toUpperCase();
  const isOwner = currentUserId && comment.userId === currentUserId;

  const timeAgo = formatRelativeTime(comment.createdAt);

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editContent.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id: comment.id, content: trimmed });
  };

  const handleDelete = () => {
    if (!confirm(__('Are you sure you want to delete this comment?'))) return;
    deleteMutation.mutate({ id: comment.id });
  };

  return (
    <div className={depth > 0 ? 'comment-item-reply' : 'comment-item'}>
      <div className="comment-item-inner">
        <div className="comment-avatar">
          {comment.userImage ? (
            <img src={comment.userImage} alt={displayName} />
          ) : (
            initial
          )}
        </div>
        <div className="comment-content">
          <div className="comment-header">
            <span className="comment-author">{displayName}</span>
            <span className="comment-time">{timeAgo}</span>
          </div>

          {isEditing ? (
            <form onSubmit={handleEdit} className="comment-form">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={5000}
                rows={3}
                autoFocus
              />
              {updateMutation.error && (
                <p className="comment-form-error">{updateMutation.error.message}</p>
              )}
              <div className="comment-form-actions">
                <button
                  type="submit"
                  disabled={!editContent.trim() || updateMutation.isPending}
                  className="comment-form-submit"
                >
                  {updateMutation.isPending ? __('Saving...') : __('Save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(comment.content);
                  }}
                  className="comment-form-cancel"
                >
                  {__('Cancel')}
                </button>
              </div>
            </form>
          ) : (
            <div className="comment-body">{comment.content}</div>
          )}

          {!isEditing && (
            <div className="comment-actions">
              {currentUserId && depth < MAX_DEPTH && (
                <button
                  type="button"
                  className="comment-action-btn"
                  onClick={() => setShowReplyForm(!showReplyForm)}
                >
                  {__('Reply')}
                </button>
              )}
              {isOwner && (
                <>
                  <button
                    type="button"
                    className="comment-action-btn"
                    onClick={() => setIsEditing(true)}
                  >
                    {__('Edit')}
                  </button>
                  <button
                    type="button"
                    className="comment-action-btn comment-action-btn-danger"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? __('Deleting...') : __('Delete')}
                  </button>
                </>
              )}
            </div>
          )}

          {showReplyForm && (
            <CommentForm
              targetType={targetType}
              targetId={targetId}
              parentId={comment.id}
              autoFocus
              onSubmitted={() => setShowReplyForm(false)}
              onCancel={() => setShowReplyForm(false)}
            />
          )}

          {replies.length > 0 && (
            <div className="comment-list">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  targetType={targetType}
                  targetId={targetId}
                  currentUserId={currentUserId}
                  replies={[]}
                  depth={Math.min(depth + 1, MAX_DEPTH)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

