'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Package, Trash2, ShoppingBag, ArrowLeft, ArrowRight, LogIn } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice, getCartSessionId } from '@/core-store/lib/store-utils';
import '@/core-store/components/cart/store-cart.css';
import '@/core-store/components/product/store-grid.css';

export default function CartPage() {
  const __ = useBlankTranslations();
  const { data: session } = useSession();
  const [sessionId] = useState(() =>
    typeof window !== 'undefined' ? getCartSessionId() : '',
  );

  const utils = trpc.useUtils();

  const { data: cart, isLoading } = trpc.storeCart.get.useQuery(
    { sessionId: sessionId || undefined },
    { refetchOnWindowFocus: true, staleTime: 30_000 },
  );

  const updateItem = trpc.storeCart.updateItem.useMutation({
    onSuccess: () => utils.storeCart.get.invalidate(),
  });

  const removeItem = trpc.storeCart.removeItem.useMutation({
    onSuccess: () => utils.storeCart.get.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="store-empty">
        <ShoppingBag className="store-empty-icon" />
        <h2 className="store-empty-title">{__('Your cart is empty')}</h2>
        <p className="store-empty-text">
          {__('Looks like you haven\'t added anything to your cart yet.')}
        </p>
        <Link href="/store" className="btn-checkout" style={{ maxWidth: '16rem', marginTop: '1rem' }}>
          <ShoppingBag className="h-4 w-4" />
          {__('Browse Store')}
        </Link>
      </div>
    );
  }

  const currency = cart.currency ?? 'EUR';

  return (
    <div className="cart-page">
      {/* ── Cart Items ─────────────────────────────────────────────── */}
      <div className="cart-items">
        <nav className="store-breadcrumb">
          <Link href="/store">
            <ArrowLeft className="h-3.5 w-3.5" />
            {__('Back to Store')}
          </Link>
        </nav>

        {cart.items.map((item) => {
          const isBusy =
            (updateItem.isPending && updateItem.variables?.itemId === item.id) ||
            (removeItem.isPending && removeItem.variables?.itemId === item.id);

          return (
            <div key={item.id} className="cart-item" style={isBusy ? { opacity: 0.6 } : undefined}>
              {/* Image */}
              <div className="cart-item-image">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.productName}
                    width={80}
                    height={80}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  />
                ) : (
                  <div className="cart-item-image-placeholder">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="cart-item-body">
                <span className="cart-item-name">{item.productName}</span>
                {item.variantName && (
                  <span className="cart-item-variant">{item.variantName}</span>
                )}
                {!item.inStock && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-danger-600)',
                    }}
                  >
                    {__('Out of stock')}
                  </span>
                )}

                <div className="cart-item-actions">
                  {/* Quantity stepper */}
                  <div className="quantity-control quantity-control-sm">
                    <button
                      type="button"
                      disabled={isBusy || !item.inStock || item.quantity <= 1}
                      onClick={() =>
                        updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                      }
                      aria-label={__('Decrease quantity')}
                    >
                      −
                    </button>
                    <span aria-label={__('Quantity')}>{item.quantity}</span>
                    <button
                      type="button"
                      disabled={isBusy || !item.inStock || item.quantity >= 99}
                      onClick={() =>
                        updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                      }
                      aria-label={__('Increase quantity')}
                    >
                      +
                    </button>
                  </div>

                  {/* Price */}
                  <span className="cart-item-price">
                    {formatPrice(item.totalCents, currency)}
                  </span>

                  {/* Remove */}
                  <button
                    type="button"
                    className="cart-item-remove"
                    disabled={isBusy}
                    onClick={() => removeItem.mutate({ itemId: item.id })}
                    aria-label={__('Remove item')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Summary Sidebar ───────────────────────────────────────── */}
      <div className="cart-summary">
        <h2 className="cart-summary-title">{__('Order Summary')}</h2>

        <div className="cart-summary-row">
          <span>
            {__('Subtotal')} ({cart.itemCount} {cart.itemCount === 1 ? __('item') : __('items')})
          </span>
          <span>{formatPrice(cart.subtotalCents, currency)}</span>
        </div>

        <div className="cart-summary-row">
          <span>{__('Shipping')}</span>
          <span className="cart-summary-tbd">{__('Calculated at checkout')}</span>
        </div>

        <div className="cart-summary-row">
          <span>{__('Tax')}</span>
          <span className="cart-summary-tbd">{__('Calculated at checkout')}</span>
        </div>

        <div className="cart-summary-row cart-summary-row-total">
          <span>{__('Total')}</span>
          <span>{formatPrice(cart.subtotalCents, currency)}</span>
        </div>

        {session?.user ? (
          <Link href="/checkout" className="btn-checkout">
            <ArrowRight className="h-4 w-4" />
            {__('Proceed to Checkout')}
          </Link>
        ) : (
          <Link href={`/login?callbackURL=/checkout`} className="btn-checkout btn-checkout-login">
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
