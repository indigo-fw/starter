'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { StarRating } from './StarRating';
import './store-reviews.css';

interface ReviewFormProps {
  productId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ productId, onSubmitted }: ReviewFormProps) {
  const __ = useBlankTranslations();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const existingReview = trpc.storeReviews.myReview.useQuery({ productId });
  const utils = trpc.useUtils();

  const createMutation = trpc.storeReviews.create.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      utils.storeReviews.myReview.invalidate({ productId });
      utils.storeReviews.listByProduct.invalidate({ productId });
      utils.storeReviews.getProductRating.invalidate({ productId });
      onSubmitted?.();
    },
  });

  // User already has a review — show read-only
  if (existingReview.data) {
    return (
      <div className="review-card">
        <div className="review-card-header">
          <StarRating rating={existingReview.data.rating} size="sm" />
          {existingReview.data.status === 'pending' && (
            <span className="review-card-date">{__('Pending approval')}</span>
          )}
        </div>
        {existingReview.data.title && (
          <div className="review-card-title">{existingReview.data.title}</div>
        )}
        {existingReview.data.body && (
          <div className="review-card-body">{existingReview.data.body}</div>
        )}
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {__('You already reviewed this product')}
        </p>
      </div>
    );
  }

  // Just submitted
  if (submitted) {
    return (
      <div className="review-card">
        <p style={{ color: 'var(--color-success-600)', fontWeight: 600 }}>
          {__('Thank you! Your review is pending approval.')}
        </p>
      </div>
    );
  }

  // Loading state
  if (existingReview.isLoading) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    createMutation.mutate({
      productId,
      rating,
      title: title.trim() || undefined,
      body: body.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Star Picker */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
          {__('Your rating')}
        </label>
        <div className="star-picker">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="star-picker-star"
              data-selected={rating >= star ? 'true' : 'false'}
              data-hover={hoverRating >= star && hoverRating !== rating ? 'true' : 'false'}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={__('Rate %d stars').replace('%d', String(star))}
            >
              <Star
                size={24}
                fill={
                  (hoverRating >= star ? hoverRating : rating) >= star
                    ? 'currentColor'
                    : 'none'
                }
              />
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="review-title"
          style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}
        >
          {__('Title')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({__('optional')})</span>
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-primary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Body */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label
          htmlFor="review-body"
          style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}
        >
          {__('Review')} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({__('optional')})</span>
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={4}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-primary)',
            color: 'var(--text-primary)',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Error */}
      {createMutation.error && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-error-600)', marginBottom: '0.5rem' }}>
          {createMutation.error.message}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={rating === 0 || createMutation.isPending}
        style={{
          padding: '0.5rem 1.25rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--color-brand-600)',
          color: '#fff',
          cursor: rating === 0 || createMutation.isPending ? 'not-allowed' : 'pointer',
          opacity: rating === 0 || createMutation.isPending ? 0.5 : 1,
        }}
      >
        {createMutation.isPending ? __('Submitting...') : __('Submit review')}
      </button>
    </form>
  );
}
