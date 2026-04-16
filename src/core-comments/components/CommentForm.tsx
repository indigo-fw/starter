'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';

interface CommentFormProps {
  targetType: string;
  targetId: string;
  parentId?: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function CommentForm({
  targetType,
  targetId,
  parentId,
  onSubmitted,
  onCancel,
  autoFocus,
}: CommentFormProps) {
  const __ = useBlankTranslations();
  const [content, setContent] = useState('');
  const utils = trpc.useUtils();

  const createMutation = trpc.comments.create.useMutation({
    onSuccess: () => {
      setContent('');
      utils.comments.list.invalidate({ targetType, targetId });
      utils.comments.count.invalidate({ targetType, targetId });
      onSubmitted?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    createMutation.mutate({
      targetType,
      targetId,
      parentId,
      content: trimmed,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="comment-form">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={parentId ? __('Write a reply...') : __('Write a comment...')}
        maxLength={5000}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
      />
      {createMutation.error && (
        <p className="comment-form-error">{createMutation.error.message}</p>
      )}
      <div className="comment-form-actions">
        <button
          type="submit"
          disabled={!content.trim() || createMutation.isPending}
          className="comment-form-submit"
        >
          {createMutation.isPending ? __('Submitting...') : __('Submit')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="comment-form-cancel">
            {__('Cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
