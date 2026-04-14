'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Loader2,
  Package,
  ChevronRight,
  Download,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations, dataTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';
import '@/core-store/components/cart/store-cart.css';

const _d = dataTranslations('General');

const STATUS_LABELS: Record<string, string> = {
  pending: _d('Pending'),
  processing: _d('Processing'),
  shipped: _d('Shipped'),
  delivered: _d('Delivered'),
  cancelled: _d('Cancelled'),
  refunded: _d('Refunded'),
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  shipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  processing: Package,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: XCircle,
  refunded: XCircle,
};

function formatDate(dateStr: Date | string | null): string {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: Date | string | null): string {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AddressData {
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

function formatAddress(addr: AddressData | null): React.ReactNode {
  if (!addr) return null;
  const name = addr.name ?? [addr.firstName, addr.lastName].filter(Boolean).join(' ');
  const lines = [
    name,
    addr.company,
    addr.address1,
    addr.address2,
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(' '),
    addr.country,
  ].filter(Boolean);

  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function DownloadButton({ token, downloadCount, downloadLimit, label }: {
  token: string;
  downloadCount: number;
  downloadLimit: number | null;
  label: string;
}) {
  const __ = useBlankTranslations();
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleDownload = async () => {
    setLoading(true);
    try {
      const result = await utils.storeOrders.getDownload.fetch({ token });
      if (result.fileUrl) {
        window.open(result.fileUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // silently fail — user sees no change
    } finally {
      setLoading(false);
    }
  };

  const isExhausted = downloadLimit != null && downloadCount >= downloadLimit;

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading || isExhausted}
      className={cn('order-download-link', isExhausted && 'opacity-50 pointer-events-none')}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span>{label}</span>
      {downloadLimit != null && (
        <span className="text-(--text-muted) text-xs">
          ({downloadCount}/{downloadLimit} {__('used')})
        </span>
      )}
    </button>
  );
}

export default function AccountOrderDetailPage() {
  const __ = useBlankTranslations();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isSuccess = searchParams.get('success') === 'true';

  const { data: order, isLoading } = trpc.storeOrders.myOrderDetail.useQuery(
    { id: params.id },
    { enabled: !!params.id },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-(--text-secondary) mb-4">{__('Order not found')}</p>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 text-sm text-brand-500 hover:text-brand-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {__('Back to orders')}
        </Link>
      </div>
    );
  }

  const StatusIcon = STATUS_ICONS[order.status] ?? Clock;
  const hasDigitalItems = order.items.some((item) => item.isDigital);
  const shippingAddress = order.shippingAddress as AddressData | null;
  const bp = order.billingProfile as { legalName?: string; address1?: string; city?: string; postalCode?: string; country?: string } | null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1.5 text-sm text-(--text-muted) hover:text-(--text-primary) transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {__('Back to orders')}
      </Link>

      {/* Success banner */}
      {isSuccess && (
        <div className="order-success-banner">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <div>
            <p className="order-success-title">{__('Order placed successfully!')}</p>
            <p className="order-success-text">
              {__('Your order has been received and is being processed.')}
            </p>
          </div>
        </div>
      )}

      {/* Order header */}
      <div className="order-header">
        <div>
          <h1 className="text-2xl font-bold">
            {__('Order')} #{order.orderNumber}
          </h1>
          {order.invoiceNumber && (
            <p className="text-sm text-(--text-muted) mt-0.5">
              {__('Invoice')}: {order.invoiceNumber}
            </p>
          )}
          <p className="text-sm text-(--text-muted) mt-1">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="order-status-badge">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
              STATUS_COLORS[order.status] ?? '',
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {__(STATUS_LABELS[order.status] ?? order.status)}
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 mt-6">
        {/* Left column */}
        <div className="space-y-8">
          {/* Items */}
          <section>
            <h2 className="order-section-title">{__('Items')}</h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="cart-item">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.productName}
                      width={64}
                      height={64}
                      className="cart-item-image rounded-lg object-cover"
                    />
                  ) : (
                    <div className="cart-item-image rounded-lg bg-(--surface-secondary) flex items-center justify-center">
                      <Package className="h-6 w-6 text-(--text-muted)" />
                    </div>
                  )}
                  <div className="cart-item-body">
                    <span className="cart-item-name">{item.productName}</span>
                    {item.variantName && (
                      <span className="cart-item-variant">{item.variantName}</span>
                    )}
                    {item.sku && (
                      <span className="text-xs text-(--text-muted)">
                        {__('SKU')}: {item.sku}
                      </span>
                    )}
                    <div className="cart-item-price">
                      {item.quantity > 1 && (
                        <span className="text-(--text-muted) text-sm">
                          {item.quantity} x {formatPrice(item.unitPriceCents, order.currency)}
                          {' = '}
                        </span>
                      )}
                      {formatPrice(item.unitPriceCents * item.quantity, order.currency)}
                    </div>
                    {item.isDigital && (
                      <span className="inline-flex items-center gap-1 text-xs text-(--text-muted) mt-1">
                        <Download className="h-3 w-3" />
                        {__('Digital download')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Downloads */}
          {hasDigitalItems && order.downloads.length > 0 && (
            <section>
              <h2 className="order-section-title">{__('Downloads')}</h2>
              <div className="order-downloads">
                {order.downloads.map((dl) => (
                  <DownloadButton
                    key={dl.id}
                    token={dl.token}
                    downloadCount={dl.downloadCount}
                    downloadLimit={dl.downloadLimit}
                    label={__('Download')}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Timeline */}
          {order.events.length > 0 && (
            <section>
              <h2 className="order-section-title">{__('Order History')}</h2>
              <div className="order-timeline">
                {order.events.map((event) => (
                  <div key={event.id} className="order-timeline-item">
                    <div className="order-timeline-dot" />
                    <div>
                      <span className="order-timeline-status">
                        {__(STATUS_LABELS[event.status] ?? event.status)}
                      </span>
                      {event.note && (
                        <p className="order-timeline-note">{event.note}</p>
                      )}
                      <span className="order-timeline-date">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tracking link in timeline context */}
              {order.trackingUrl && (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="order-tracking-link mt-3"
                >
                  <Truck className="inline h-4 w-4 mr-1" />
                  {__('Track shipment')}
                </a>
              )}
            </section>
          )}
        </div>

        {/* Right column (sidebar) */}
        <div className="space-y-4">
          {/* Order summary */}
          <div className="cart-summary">
            <span className="cart-summary-title">{__('Order Summary')}</span>
            <div className="cart-summary-row">
              <span>{__('Subtotal')}</span>
              <span>{formatPrice(order.subtotalCents, order.currency)}</span>
            </div>
            {order.shippingCents > 0 && (
              <div className="cart-summary-row">
                <span>{__('Shipping')}</span>
                <span>{formatPrice(order.shippingCents, order.currency)}</span>
              </div>
            )}
            {order.taxCents > 0 && (
              <div className="cart-summary-row">
                <span>{__('Tax')}</span>
                <span>{formatPrice(order.taxCents, order.currency)}</span>
              </div>
            )}
            {order.discountCents > 0 && (
              <div className="cart-summary-row">
                <span>{__('Discount')}</span>
                <span>-{formatPrice(order.discountCents, order.currency)}</span>
              </div>
            )}
            <div className="cart-summary-row cart-summary-row-total">
              <span>{__('Total')}</span>
              <span>{formatPrice(order.totalCents, order.currency)}</span>
            </div>
          </div>

          {/* Shipping address */}
          {shippingAddress && (
            <div className="cart-summary">
              <span className="cart-summary-title">{__('Shipping Address')}</span>
              <p className="text-sm text-(--text-secondary) leading-relaxed">
                {formatAddress(shippingAddress)}
              </p>
              {order.shippingMethod && (
                <p className="text-xs text-(--text-muted) mt-2">
                  {__('Method')}: {order.shippingMethod}
                </p>
              )}
              {order.trackingNumber && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <span className="text-xs text-(--text-muted) uppercase tracking-wider">
                    {__('Tracking')}
                  </span>
                  {order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="order-tracking-link"
                    >
                      {order.trackingNumber}
                    </a>
                  ) : (
                    <p className="text-sm font-mono mt-0.5">{order.trackingNumber}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Billing profile */}
          {bp?.address1 && (
            <div className="cart-summary">
              <span className="cart-summary-title">{__('Billing Address')}</span>
              <p className="text-sm text-(--text-secondary) leading-relaxed">
                {[bp.legalName, bp.address1, [bp.postalCode, bp.city].filter(Boolean).join(' '), bp.country].filter(Boolean).join('\n')}
              </p>
            </div>
          )}

          {/* Customer note */}
          {order.customerNote && (
            <div className="cart-summary">
              <span className="cart-summary-title">{__('Your Note')}</span>
              <p className="text-sm text-(--text-secondary)">{order.customerNote}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
