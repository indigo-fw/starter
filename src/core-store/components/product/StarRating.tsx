'use client';

import { Star } from 'lucide-react';
import './store-reviews.css';

interface StarRatingProps {
  rating: number;
  totalReviews?: number;
  size?: 'sm' | 'md';
}

export function StarRating({ rating, totalReviews, size = 'sm' }: StarRatingProps) {
  return (
    <span className={`star-rating star-rating-${size}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = rating >= star;
        const partial = !filled && rating > star - 1;
        const fillPercent = partial ? Math.round((rating - (star - 1)) * 100) : 0;

        return (
          <span
            key={star}
            className="star-rating-star"
            data-filled={filled ? 'true' : partial ? 'partial' : 'false'}
          >
            {partial ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <defs>
                  <clipPath id={`star-clip-${star}`}>
                    <rect x="0" y="0" width={`${fillPercent}%`} height="100%" />
                  </clipPath>
                </defs>
                {/* Filled portion */}
                <polygon
                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  fill="currentColor"
                  stroke="none"
                  clipPath={`url(#star-clip-${star})`}
                />
                {/* Full outline */}
                <polygon
                  points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  fill="none"
                />
              </svg>
            ) : (
              <Star fill={filled ? 'currentColor' : 'none'} />
            )}
          </span>
        );
      })}
      {totalReviews !== undefined && (
        <span className="star-rating-count">({totalReviews})</span>
      )}
    </span>
  );
}
