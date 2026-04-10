'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Loader2,
  MapPin,
  Package,
  Save,
  Truck,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  processing: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  shipped: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  delivered: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  refunded: 'bg-(--surface-secondary) text-(--text-muted)',
};

function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Address {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

function AddressCard({ title, address, icon: Icon }: { title: string; address: Address | null; icon: React.ElementType }) {
  const __ = useAdminTranslations();
  if (!address) return null;

  return (
    <div className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
        <Icon className="h-4 w-4 text-(--text-muted)" />
        {__(title)}
      </h3>
      <div className="mt-2 text-sm text-(--text-secondary) space-y-0.5">
        <p>{address.firstName} {address.lastName}</p>
        {address.company && <p>{address.company}</p>}
        <p>{address.address1}</p>
        {address.address2 && <p>{address.address2}</p>}
        <p>{address.city}{address.state ? `, ${address.state}` : ''} {address.postalCode}</p>
        <p>{address.country}</p>
        {address.phone && <p>{address.phone}</p>}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();
  const utils = trpc.useUtils();

  const [newStatus, setNewStatus] = useState<string>('');
  const [statusNote, setStatusNote] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');

  const orderQuery = trpc.storeOrders.adminGet.useQuery(
    { id: params.id },
    { enabled: !!params.id },
  );

  const updateStatus = trpc.storeOrders.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(__('Status updated'));
      utils.storeOrders.adminGet.invalidate({ id: params.id });
      setNewStatus('');
      setStatusNote('');
      setTrackingNumber('');
      setTrackingUrl('');
    },
    onError: (err) => toast.error(err.message),
  });

  if (orderQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="py-24 text-center text-sm text-(--text-muted)">
        {__('Order not found.')}
      </div>
    );
  }

  const order = orderQuery.data;
  const shippingAddress = order.shippingAddress as Address | null;
  const billingAddress = order.billingAddress as Address | null;

  function handleStatusUpdate() {
    if (!newStatus) { toast.error(__('Select a status')); return; }
    updateStatus.mutate({
      orderId: params.id,
      status: newStatus as 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded',
      note: statusNote || undefined,
      trackingNumber: trackingNumber || undefined,
      trackingUrl: trackingUrl || undefined,
    });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.storeOrders}
              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {__('Order')} {order.orderNumber}
            </h1>
            <span className={cn(
              'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
              STATUS_BADGE[order.status] ?? 'bg-(--surface-secondary) text-(--text-muted)',
            )}>
              {__(order.status)}
            </span>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
        {/* Order info */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Order Information')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-(--text-muted)">{__('Order Number')}</p>
              <p className="mt-0.5 text-sm font-medium text-(--text-primary)">{order.orderNumber}</p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Date')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">{formatShortDate(order.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Payment')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">
                {order.paymentProviderId ?? '—'}
                {order.paidAt && <span className="ml-1 text-xs text-(--text-muted)">({formatShortDate(order.paidAt)})</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Invoice')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">{order.invoiceNumber ?? '—'}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-(--text-muted)">{__('Subtotal')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">{formatPrice(order.subtotalCents, order.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Shipping')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">{formatPrice(order.shippingCents, order.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Tax')}</p>
              <p className="mt-0.5 text-sm text-(--text-primary)">{formatPrice(order.taxCents, order.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-(--text-muted)">{__('Total')}</p>
              <p className="mt-0.5 text-sm font-bold text-(--text-primary)">{formatPrice(order.totalCents, order.currency)}</p>
            </div>
          </div>
          {order.discountCode && (
            <p className="mt-3 text-xs text-(--text-muted)">
              {__('Discount')}: {order.discountCode} ({formatPrice(order.discountCents, order.currency)})
            </p>
          )}
          {order.trackingNumber && (
            <p className="mt-2 text-sm text-(--text-secondary)">
              <Truck className="mr-1 inline h-4 w-4" />
              {__('Tracking')}: {order.trackingUrl ? (
                <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{order.trackingNumber}</a>
              ) : order.trackingNumber}
            </p>
          )}
        </div>

        {/* Status update */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Update Status')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{__('New Status')}</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="select">
                <option value="">{__('Select status...')}</option>
                <option value="processing">{__('Processing')}</option>
                <option value="shipped">{__('Shipped')}</option>
                <option value="delivered">{__('Delivered')}</option>
                <option value="cancelled">{__('Cancelled')}</option>
                <option value="refunded">{__('Refunded')}</option>
              </select>
            </div>
            <div>
              <label className="label">{__('Note (optional)')}</label>
              <input type="text" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className="input" placeholder={__('Internal note...')} />
            </div>
            {newStatus === 'shipped' && (
              <>
                <div>
                  <label className="label">{__('Tracking Number')}</label>
                  <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">{__('Tracking URL')}</label>
                  <input type="text" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} className="input" placeholder="https://..." />
                </div>
              </>
            )}
          </div>
          <div className="mt-4">
            <button
              onClick={handleStatusUpdate}
              disabled={!newStatus || updateStatus.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {__('Update Status')}
            </button>
          </div>
        </div>

        {/* Order items */}
        <div className="card mt-4 overflow-hidden">
          <div className="p-4 pb-0">
            <h2 className="h2">{__('Order Items')}</h2>
          </div>
          <table className="mt-3 w-full">
            <thead className="table-thead">
              <tr>
                <th className="table-th">{__('Product')}</th>
                <th className="table-th w-28">{__('Variant')}</th>
                <th className="table-th w-16">{__('Qty')}</th>
                <th className="table-th w-28">{__('Unit Price')}</th>
                <th className="table-th w-28">{__('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="table-tr">
                  <td className="table-td table-td-primary font-medium text-(--text-primary)">{item.productName}</td>
                  <td className="table-td text-xs text-(--text-muted)">{item.variantName ?? '—'}</td>
                  <td className="table-td text-sm text-(--text-secondary)">{item.quantity}</td>
                  <td className="table-td text-sm">{formatPrice(item.unitPriceCents, order.currency)}</td>
                  <td className="table-td text-sm font-medium">{formatPrice(item.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Events timeline */}
        {order.events.length > 0 && (
          <div className="card mt-4 p-6">
            <h2 className="h2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-(--text-muted)" />
              {__('Timeline')}
            </h2>
            <div className="mt-4 space-y-3">
              {order.events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 border-l-2 border-(--border-primary) pl-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        STATUS_BADGE[event.status] ?? 'bg-(--surface-secondary) text-(--text-muted)',
                      )}>
                        {event.status}
                      </span>
                      <span className="text-xs text-(--text-muted)">{formatDate(event.createdAt)}</span>
                    </div>
                    {event.note && <p className="mt-1 text-sm text-(--text-secondary)">{event.note}</p>}
                    <p className="mt-0.5 text-xs text-(--text-muted)">{__('by')} {event.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Addresses */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AddressCard title="Shipping Address" address={shippingAddress} icon={Truck} />
          <AddressCard title="Billing Address" address={billingAddress} icon={MapPin} />
        </div>

        {/* Admin note */}
        {order.adminNote && (
          <div className="card mt-4 p-6">
            <h2 className="h2">{__('Admin Note')}</h2>
            <p className="mt-2 text-sm text-(--text-secondary)">{order.adminNote}</p>
          </div>
        )}

        {/* Customer note */}
        {order.customerNote && (
          <div className="card mt-4 p-6">
            <h2 className="h2">{__('Customer Note')}</h2>
            <p className="mt-2 text-sm text-(--text-secondary)">{order.customerNote}</p>
          </div>
        )}
      </div></main>
    </>
  );
}
