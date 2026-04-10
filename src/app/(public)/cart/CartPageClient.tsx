'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { ShoppingCart, Trash2, Minus, Plus, Lock, LogIn } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';

function formatPrice(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

function getSessionId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )cart_session=([^;]*)/);
  if (match) return match[1]!;
  const id = crypto.randomUUID();
  document.cookie = `cart_session=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  return id;
}

/* ── Skeleton ── */

function CartSkeleton() {
  return (
    <div className="cart-page">
      <div className="cart-items">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cart-item">
            <div className="cart-item-image skeleton-box" />
            <div className="cart-item-body">
              <div className="skeleton-line" style={{ width: '60%' }} />
              <div className="skeleton-line" style={{ width: '30%', marginTop: '0.375rem' }} />
              <div className="skeleton-line" style={{ width: '40%', marginTop: 'auto' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="cart-summary">
        <div className="skeleton-line" style={{ width: '50%', height: '1.25rem' }} />
        <div className="skeleton-line" style={{ width: '100%', marginTop: '1rem' }} />
        <div className="skeleton-line" style={{ width: '100%' }} />
        <div className="skeleton-line" style={{ width: '100%', height: '3rem', marginTop: '0.5rem', borderRadius: 'var(--radius-lg)' }} />
      </div>
    </div>
  );
}

/* ── Cart Page ── */

export function CartPageClient() {
  const __ = useBlankTranslations();
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const sessionIdRef = useRef('');

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  const utils = trpc.useUtils();
  const { data: cart, isLoading } = trpc.storeCart.get.useQuery(
    { sessionId: sessionIdRef.current || undefined },
    { staleTime: 10_000 },
  );

  const updateItem = trpc.storeCart.updateItem.useMutation({
    onSuccess: () => utils.storeCart.get.invalidate(),
  });

  const removeItem = trpc.storeCart.removeItem.useMutation({
    onSuccess: () => utils.storeCart.get.invalidate(),
  });

  if (isLoading) {
    return <CartSkeleton />;
  }

  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="store-empty">
        <ShoppingCart className="h-16 w-16 store-empty-icon" />
        <p className="store-empty-title">{__('Your cart is empty')}</p>
        <p className="store-empty-text">{__('Browse our store and add some items')}</p>
        <Link href="/store" className="btn-checkout" style={{ maxWidth: '240px' }}>
          {__('Continue Shopping')}
        </Link>
      </div>
    );
  }

  const subtotal = cart?.subtotalCents ?? 0;
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="cart-page">
      {/* ── Items ── */}
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-image">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.productName}
                  width={80}
                  height={80}
                  sizes="80px"
                />
              ) : (
                <div className="cart-item-image-placeholder">
                  <ShoppingCart className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="cart-item-body">
              <span className="cart-item-name">{item.productName}</span>
              {item.variantName && (
                <span className="cart-item-variant">{item.variantName}</span>
              )}
              <div className="cart-item-actions">
                <div className="quantity-control quantity-control-sm">
                  <button
                    type="button"
                    onClick={() => updateItem.mutate({ itemId: item.id, quantity: Math.max(1, item.quantity - 1) })}
                    disabled={updateItem.isPending}
                    aria-label={__('Decrease quantity')}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateItem.mutate({ itemId: item.id, quantity: Math.min(99, item.quantity + 1) })}
                    disabled={updateItem.isPending}
                    aria-label={__('Increase quantity')}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() => removeItem.mutate({ itemId: item.id })}
                  disabled={removeItem.isPending}
                  title={__('Remove')}
                  aria-label={__('Remove {product}', { product: item.productName })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <span className="cart-item-price">
                  {formatPrice(item.totalCents)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Summary ── */}
      <div className="cart-summary">
        <span className="cart-summary-title">{__('Order Summary')}</span>
        <div className="cart-summary-row">
          <span>{__('Subtotal ({count} items)', { count: totalItems })}</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="cart-summary-row">
          <span>{__('Shipping')}</span>
          <span className="cart-summary-tbd">{__('Calculated at checkout')}</span>
        </div>
        <div className="cart-summary-row cart-summary-row-total">
          <span>{__('Total')}</span>
          <span>{formatPrice(subtotal)}</span>
        </div>

        {isLoggedIn ? (
          <button type="button" className="btn-checkout">
            <Lock className="h-4 w-4" />
            {__('Proceed to Checkout')}
          </button>
        ) : (
          <Link href="/login" className="btn-checkout btn-checkout-login">
            <LogIn className="h-4 w-4" />
            {__('Sign in to Checkout')}
          </Link>
        )}

        <Link href="/store" className="cart-continue">
          {__('Continue Shopping')}
        </Link>
      </div>
    </div>
  );
}
