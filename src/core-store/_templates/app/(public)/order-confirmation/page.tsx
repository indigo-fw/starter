'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Download, Loader2, Package, ShoppingBag } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice } from '@/core-store/lib/store-utils';
import '@/core-store/components/cart/store-cart.css';

export default function OrderConfirmationPage() {
  const __ = useBlankTranslations();
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order');
  const email = searchParams.get('email');

  const { data: order, isLoading, error } = trpc.storeOrders.guestOrderDetail.useQuery(
    { orderNumber: orderNumber ?? '', email: email ?? '' },
    { enabled: !!orderNumber && !!email, retry: false },
  );

  if (!orderNumber || !email) {
    return (
      <div className="store-empty">
        <ShoppingBag className="store-empty-icon" />
        <p className="store-empty-title">{__('Invalid confirmation link')}</p>
        <Link href="/store" className="btn-checkout" style={{ maxWidth: '16rem', marginTop: '1rem' }}>
          {__('Continue Shopping')}
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="store-empty">
        <Package className="store-empty-icon" />
        <p className="store-empty-title">{__('Order not found')}</p>
        <p className="store-empty-text">{__('Please check your order number and email address.')}</p>
        <Link href="/store" className="btn-checkout" style={{ maxWidth: '16rem', marginTop: '1rem' }}>
          {__('Continue Shopping')}
        </Link>
      </div>
    );
  }

  const currency = order.currency ?? 'EUR';
  const hasDownloads = order.downloads && order.downloads.length > 0;

  return (
    <div style={{ maxWidth: '40rem', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Success header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <CheckCircle2
          className="h-12 w-12"
          style={{ color: 'var(--color-success-600)', margin: '0 auto 1rem' }}
        />
        <h1 className="text-2xl font-bold">{__('Thank you for your order!')}</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          {__('Order')} <strong>#{order.orderNumber}</strong>
        </p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {__('A confirmation email has been sent to')} <strong>{email}</strong>
        </p>
      </div>

      {/* Order items */}
      <div className="cart-summary">
        <h2 className="cart-summary-title">{__('Order Summary')}</h2>
        {order.items.map((item) => (
          <div key={item.id} className="checkout-summary-item">
            <span>
              {item.productName}
              {item.variantName && ` — ${item.variantName}`}
              {item.quantity > 1 && ` x${item.quantity}`}
            </span>
            <span>{formatPrice(item.totalCents, currency)}</span>
          </div>
        ))}

        <div className="cart-summary-row" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          <span>{__('Subtotal')}</span>
          <span>{formatPrice(order.subtotalCents, currency)}</span>
        </div>
        {order.shippingCents > 0 && (
          <div className="cart-summary-row">
            <span>{__('Shipping')}</span>
            <span>{formatPrice(order.shippingCents, currency)}</span>
          </div>
        )}
        {order.taxCents > 0 && (
          <div className="cart-summary-row">
            <span>{__('Tax')}</span>
            <span>{formatPrice(order.taxCents, currency)}</span>
          </div>
        )}
        {(order.discountCents ?? 0) > 0 && (
          <div className="cart-summary-row">
            <span>{__('Discount')}</span>
            <span>-{formatPrice(order.discountCents, currency)}</span>
          </div>
        )}
        <div className="cart-summary-row cart-summary-row-total">
          <span>{__('Total')}</span>
          <span>{formatPrice(order.totalCents, currency)}</span>
        </div>
      </div>

      {/* Downloads */}
      {hasDownloads && (
        <div className="cart-summary" style={{ marginTop: '1rem' }}>
          <h2 className="cart-summary-title">{__('Downloads')}</h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            {__('Your digital products are ready to download.')}
          </p>
          {order.downloads.map((dl) => (
            <a
              key={dl.id}
              href={`/api/store/download/${dl.token}`}
              className="flex items-center gap-2 py-2 px-3 rounded-lg border border-(--border-primary) hover:border-brand-400 transition-colors text-sm font-medium mb-2"
            >
              <Download className="h-4 w-4" />
              {__('Download')}
              {dl.downloadLimit && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'auto' }}>
                  {dl.downloadCount}/{dl.downloadLimit}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Lookup info */}
      <p className="text-sm text-center mt-6" style={{ color: 'var(--text-muted)' }}>
        {__('Save your order number to check status later.')}
      </p>

      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <Link
          href="/store"
          className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          {__('Continue Shopping')}
        </Link>
      </div>
    </div>
  );
}
