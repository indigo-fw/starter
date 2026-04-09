'use client';

import { useEffect, useRef } from 'react';
import { ShoppingCart, Trash2, Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Link } from '@/i18n/navigation';

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

export function CartPageClient() {
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
    return <p className="text-(--text-muted) py-12 text-center">Loading cart...</p>;
  }

  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <ShoppingCart className="h-16 w-16 cart-empty-icon" />
        <p className="cart-empty-title">Your cart is empty</p>
        <p className="cart-empty-text">Browse our store and add some items</p>
        <Link href="/store" className="btn-checkout" style={{ maxWidth: '240px' }}>
          Continue Shopping
        </Link>
      </div>
    );
  }

  const subtotal = cart?.subtotalCents ?? 0;

  return (
    <div className="cart-page">
      {/* ── Items ── */}
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <div className="cart-item-image">
              {item.image ? (
                <img src={item.image} alt={item.productName} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
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
                <div className="quantity-control" style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                  <button
                    type="button"
                    onClick={() => updateItem.mutate({ itemId: item.id, quantity: Math.max(1, item.quantity - 1) })}
                    disabled={updateItem.isPending}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateItem.mutate({ itemId: item.id, quantity: Math.min(99, item.quantity + 1) })}
                    disabled={updateItem.isPending}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() => removeItem.mutate({ itemId: item.id })}
                  disabled={removeItem.isPending}
                  title="Remove"
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
        <span className="cart-summary-title">Order Summary</span>
        <div className="cart-summary-row">
          <span>Subtotal ({items.length} {items.length === 1 ? 'item' : 'items'})</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="cart-summary-row">
          <span>Shipping</span>
          <span className="text-(--text-muted)">Calculated at checkout</span>
        </div>
        <div className="cart-summary-row cart-summary-row-total">
          <span>Total</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <button type="button" className="btn-checkout" disabled>
          Proceed to Checkout
        </button>
        <Link href="/store" className="cart-continue">
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
