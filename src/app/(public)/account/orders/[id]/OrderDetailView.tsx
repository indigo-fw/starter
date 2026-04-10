'use client';

import { CheckCircle, Clock, Package, Truck, Download, ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice } from '@/core-store/lib/store-utils';

interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isDigital: boolean;
  image: string | null;
}

interface OrderEvent {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
}

interface OrderDownload {
  id: string;
  token: string;
  fileUrl: string;
  downloadCount: number;
  downloadLimit: number | null;
}

export interface OrderData {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingMethod: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  invoiceNumber: string | null;
  customerNote: string | null;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  shippingAddress: Record<string, string> | null;
  items: OrderItem[];
  events: OrderEvent[];
  downloads: OrderDownload[];
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; label: string; color: string }> = {
  pending: { icon: Clock, label: 'Pending', color: 'var(--text-muted)' },
  processing: { icon: Package, label: 'Processing', color: 'var(--color-brand-500)' },
  shipped: { icon: Truck, label: 'Shipped', color: 'var(--color-accent-600)' },
  delivered: { icon: CheckCircle, label: 'Delivered', color: 'var(--color-success-600)' },
  cancelled: { icon: Clock, label: 'Cancelled', color: 'oklch(0.58 0.22 25)' },
  refunded: { icon: Clock, label: 'Refunded', color: 'var(--text-muted)' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function OrderDetailView({ order }: { order: OrderData }) {
  const __ = useBlankTranslations();
  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const isNew = order.status === 'pending' || order.status === 'processing';

  return (
    <>
      <Link href="/account" className="store-breadcrumb" style={{ marginBottom: '1.5rem', display: 'inline-flex' }}>
        <ArrowLeft className="h-4 w-4" /> {__('My Account')}
      </Link>

      {/* ── Success Banner (for new orders) ── */}
      {isNew && (
        <div className="order-success-banner">
          <CheckCircle className="h-6 w-6" />
          <div>
            <p className="order-success-title">{__('Order placed successfully!')}</p>
            <p className="order-success-text">
              {__('Your order {number} has been received.', { number: order.orderNumber })}
            </p>
          </div>
        </div>
      )}

      {/* ── Order Header ── */}
      <div className="order-header">
        <div>
          <h1 className="store-title">{__('Order')} #{order.orderNumber}</h1>
          <p className="text-(--text-muted) text-sm mt-1">{__('Placed on')} {formatDate(order.createdAt)}</p>
        </div>
        <div className="order-status-badge" style={{ color: statusCfg.color }}>
          <StatusIcon className="h-4 w-4" />
          {__(statusCfg.label)}
        </div>
      </div>

      <div className="cart-page" style={{ marginTop: '1.5rem' }}>
        {/* ── Items ── */}
        <div>
          <h2 className="order-section-title">{__('Items')}</h2>
          <div className="cart-items">
            {order.items.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-body">
                  <span className="cart-item-name">{item.productName}</span>
                  {item.variantName && <span className="cart-item-variant">{item.variantName}</span>}
                  <div className="cart-item-actions">
                    <span className="text-(--text-muted) text-sm">× {item.quantity}</span>
                    <span className="cart-item-price">{formatPrice(item.totalCents, order.currency)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Digital Downloads ── */}
          {order.downloads.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2 className="order-section-title">{__('Downloads')}</h2>
              <div className="order-downloads">
                {order.downloads.map((dl) => (
                  <a
                    key={dl.id}
                    href={`/api/store/download/${dl.token}`}
                    className="order-download-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    <span>{__('Download')}</span>
                    {dl.downloadLimit && (
                      <span className="text-(--text-muted) text-xs">
                        ({dl.downloadCount}/{dl.downloadLimit})
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          {order.events.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2 className="order-section-title">{__('Timeline')}</h2>
              <div className="order-timeline">
                {order.events.map((event) => (
                  <div key={event.id} className="order-timeline-item">
                    <div className="order-timeline-dot" />
                    <div>
                      <span className="order-timeline-status">{event.status}</span>
                      {event.note && <p className="order-timeline-note">{event.note}</p>}
                      <span className="order-timeline-date">{formatDate(event.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Summary Sidebar ── */}
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
          <div className="cart-summary-row cart-summary-row-total">
            <span>{__('Total')}</span>
            <span>{formatPrice(order.totalCents, order.currency)}</span>
          </div>

          {order.invoiceNumber && (
            <div className="cart-summary-row">
              <span>{__('Invoice')}</span>
              <span>{order.invoiceNumber}</span>
            </div>
          )}

          {order.trackingNumber && (
            <div style={{ marginTop: '0.5rem' }}>
              <span className="text-(--text-muted) text-sm">{__('Tracking')}</span>
              {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="order-tracking-link">
                  {order.trackingNumber}
                </a>
              ) : (
                <p className="text-sm font-mono">{order.trackingNumber}</p>
              )}
            </div>
          )}

          {order.shippingAddress && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-(--text-muted) text-xs uppercase tracking-wider">{__('Ships to')}</span>
              <p className="text-sm text-(--text-secondary) mt-1">
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />
                {order.shippingAddress.address1}<br />
                {order.shippingAddress.city}, {order.shippingAddress.postalCode}<br />
                {order.shippingAddress.country}
              </p>
            </div>
          )}

          {order.customerNote && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-(--text-muted) text-xs uppercase tracking-wider">{__('Note')}</span>
              <p className="text-sm text-(--text-secondary) mt-1">{order.customerNote}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
