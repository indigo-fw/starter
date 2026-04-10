'use client';

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Check, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import { getCartSessionId } from '@/core-store/lib/store-utils';

export function AddToCartForm({
  productId,
  variantId,
  disabled,
}: {
  productId: string;
  variantId?: string;
  disabled?: boolean;
}) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const sessionIdRef = useRef('');

  useEffect(() => {
    sessionIdRef.current = getCartSessionId();
  }, []);

  const utils = trpc.useUtils();
  const addToCart = trpc.storeCart.addItem.useMutation({
    onSuccess: () => {
      utils.storeCart.get.invalidate();
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    },
  });

  function handleAdd() {
    addToCart.mutate({
      sessionId: sessionIdRef.current || undefined,
      productId,
      variantId,
      quantity,
    });
  }

  return (
    <div className="add-to-cart-section">
      <div className="add-to-cart-row">
        <div className="quantity-control">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label={__('Decrease quantity')}
          >
            −
          </button>
          <span aria-label={__('Quantity')}>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(99, quantity + 1))}
            aria-label={__('Increase quantity')}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="btn-add-to-cart"
          onClick={handleAdd}
          disabled={addToCart.isPending || disabled}
        >
          {added ? (
            <>
              <Check className="h-4 w-4" />
              {__('Added to cart!')}
            </>
          ) : addToCart.isPending ? (
            <span>{__('Adding...')}</span>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              {__('Add to Cart')}
            </>
          )}
        </button>
      </div>
      {added && (
        <button
          type="button"
          className="btn-view-cart"
          onClick={() => router.push('/cart')}
        >
          {__('View Cart')}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
