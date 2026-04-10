'use client';

import { useState, useEffect, useRef } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Link } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice, getCartSessionId } from '@/core-store/lib/store-utils';

const COUNTRIES = [
  { code: 'DE', name: 'Germany' }, { code: 'AT', name: 'Austria' }, { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' }, { code: 'ES', name: 'Spain' }, { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' }, { code: 'PL', name: 'Poland' }, { code: 'CZ', name: 'Czech Republic' },
  { code: 'SK', name: 'Slovakia' }, { code: 'SE', name: 'Sweden' }, { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' }, { code: 'US', name: 'United States' },
];

interface AddressFields {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

const emptyAddress: AddressFields = {
  firstName: '', lastName: '', company: '', address1: '', address2: '',
  city: '', state: '', postalCode: '', country: 'DE', phone: '',
};

function AddressForm({
  address,
  onChange,
  label,
}: {
  address: AddressFields;
  onChange: (a: AddressFields) => void;
  label: string;
}) {
  const __ = useBlankTranslations();
  const set = (field: keyof AddressFields, value: string) => onChange({ ...address, [field]: value });

  return (
    <fieldset className="checkout-fieldset">
      <legend className="checkout-legend">{label}</legend>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('First Name')} *</label>
          <input className="input" required value={address.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </div>
        <div className="checkout-field">
          <label className="label">{__('Last Name')} *</label>
          <input className="input" required value={address.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
      </div>
      <div className="checkout-field">
        <label className="label">{__('Company')}</label>
        <input className="input" value={address.company} onChange={(e) => set('company', e.target.value)} />
      </div>
      <div className="checkout-field">
        <label className="label">{__('Address')} *</label>
        <input className="input" required value={address.address1} onChange={(e) => set('address1', e.target.value)} />
      </div>
      <div className="checkout-field">
        <label className="label">{__('Address line 2')}</label>
        <input className="input" value={address.address2} onChange={(e) => set('address2', e.target.value)} />
      </div>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('City')} *</label>
          <input className="input" required value={address.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="checkout-field">
          <label className="label">{__('Postal Code')} *</label>
          <input className="input" required value={address.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
        </div>
      </div>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('Country')} *</label>
          <select className="input" required value={address.country} onChange={(e) => set('country', e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className="checkout-field">
          <label className="label">{__('Phone')}</label>
          <input className="input" type="tel" value={address.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
      </div>
    </fieldset>
  );
}

export function CheckoutForm() {
  const __ = useBlankTranslations();
  const sessionIdRef = useRef('');
  const [shipping, setShipping] = useState<AddressFields>(emptyAddress);
  const [customerNote, setCustomerNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = getCartSessionId();
  }, []);

  const { data: cart } = trpc.storeCart.get.useQuery(
    { sessionId: sessionIdRef.current || undefined },
    { staleTime: 10_000 },
  );

  const { data: totals } = trpc.storeCheckout.calculateTotals.useQuery(
    { country: shipping.country },
    { enabled: !!shipping.country },
  );

  const { data: shippingOptions } = trpc.storeCheckout.getShippingOptions.useQuery(
    { country: shipping.country },
    { enabled: !!shipping.country },
  );

  const [selectedShippingRate, setSelectedShippingRate] = useState<string | undefined>();

  const placeOrder = trpc.storeCheckout.placeOrder.useMutation({
    onSuccess: (result) => {
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        window.location.href = `/account?order=${result.orderNumber}`;
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!shipping.firstName || !shipping.lastName || !shipping.address1 || !shipping.city || !shipping.postalCode) {
      setError(__('Please fill in all required fields'));
      return;
    }

    placeOrder.mutate({
      shippingAddress: {
        firstName: shipping.firstName,
        lastName: shipping.lastName,
        company: shipping.company || undefined,
        address1: shipping.address1,
        address2: shipping.address2 || undefined,
        city: shipping.city,
        state: shipping.state || undefined,
        postalCode: shipping.postalCode,
        country: shipping.country,
        phone: shipping.phone || undefined,
      },
      shippingRateId: selectedShippingRate,
      customerNote: customerNote || undefined,
    });
  }

  const subtotal = cart?.subtotalCents ?? 0;
  const shippingCost = totals?.shippingCents ?? 0;
  const tax = totals?.taxCents ?? 0;
  const total = subtotal + shippingCost + tax;

  return (
    <form onSubmit={handleSubmit} className="cart-page">
      <div className="checkout-main">
        <AddressForm
          address={shipping}
          onChange={setShipping}
          label={__('Shipping Address')}
        />

        {shippingOptions && shippingOptions.length > 0 && (
          <fieldset className="checkout-fieldset">
            <legend className="checkout-legend">{__('Shipping Method')}</legend>
            <div className="checkout-shipping-options">
              {shippingOptions.map((opt) => (
                <label key={opt.rateId} className="checkout-shipping-option">
                  <input
                    type="radio"
                    name="shipping"
                    value={opt.rateId}
                    checked={selectedShippingRate === opt.rateId}
                    onChange={() => setSelectedShippingRate(opt.rateId)}
                  />
                  <span className="checkout-shipping-option-info">
                    <strong>{opt.name}</strong>
                    <span className="text-(--text-muted)">{opt.estimatedDays} {__('days')}</span>
                  </span>
                  <span className="checkout-shipping-option-price">
                    {opt.rateCents === 0 ? __('Free') : formatPrice(opt.rateCents)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="checkout-fieldset">
          <legend className="checkout-legend">{__('Order Note')}</legend>
          <textarea
            className="input"
            rows={3}
            placeholder={__('Any special instructions...')}
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            maxLength={1000}
          />
        </fieldset>
      </div>

      <div className="cart-summary">
        <span className="cart-summary-title">{__('Order Summary')}</span>

        {cart?.items.map((item) => (
          <div key={item.id} className="checkout-summary-item">
            <span>{item.productName} × {item.quantity}</span>
            <span>{formatPrice(item.totalCents)}</span>
          </div>
        ))}

        <div className="cart-summary-row" style={{ marginTop: '0.5rem' }}>
          <span>{__('Subtotal')}</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className="cart-summary-row">
          <span>{__('Shipping')}</span>
          <span>{shippingCost > 0 ? formatPrice(shippingCost) : __('Free')}</span>
        </div>
        {tax > 0 && (
          <div className="cart-summary-row">
            <span>{__('Tax')}</span>
            <span>{formatPrice(tax)}</span>
          </div>
        )}
        <div className="cart-summary-row cart-summary-row-total">
          <span>{__('Total')}</span>
          <span>{formatPrice(total)}</span>
        </div>

        {error && (
          <div className="checkout-error">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-checkout"
          disabled={placeOrder.isPending}
        >
          {placeOrder.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {__('Processing...')}</>
          ) : (
            <><Lock className="h-4 w-4" /> {__('Place Order')}</>
          )}
        </button>

        <Link href="/cart" className="cart-continue">
          {__('Back to Cart')}
        </Link>
      </div>
    </form>
  );
}
