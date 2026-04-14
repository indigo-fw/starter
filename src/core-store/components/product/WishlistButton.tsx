'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import './WishlistButton.css';

interface WishlistButtonProps {
  productId: string;
  initialWishlisted?: boolean;
}

export function WishlistButton({ productId, initialWishlisted }: WishlistButtonProps) {
  const __ = useBlankTranslations();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const checkQuery = trpc.storeWishlist.check.useQuery(
    { productId },
    { enabled: initialWishlisted === undefined },
  );

  const utils = trpc.useUtils();

  const toggle = trpc.storeWishlist.toggle.useMutation({
    onMutate: () => {
      setOptimistic((prev) => {
        const current = prev ?? initialWishlisted ?? checkQuery.data?.wishlisted ?? false;
        return !current;
      });
    },
    onSuccess: (data) => {
      setOptimistic(data.wishlisted);
      utils.storeWishlist.check.setData({ productId }, { wishlisted: data.wishlisted });
      utils.storeWishlist.checkMany.invalidate();
      utils.storeWishlist.list.invalidate();
    },
    onError: () => {
      // Revert optimistic update
      setOptimistic(null);
    },
  });

  const wishlisted = optimistic ?? initialWishlisted ?? checkQuery.data?.wishlisted ?? false;

  return (
    <button
      type="button"
      className="wishlist-btn"
      data-active={wishlisted ? 'true' : 'false'}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ productId })}
      aria-label={wishlisted ? __('Remove from wishlist') : __('Add to wishlist')}
      title={wishlisted ? __('Remove from wishlist') : __('Add to wishlist')}
    >
      <Heart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
    </button>
  );
}
