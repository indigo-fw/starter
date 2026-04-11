'use client';

import { useState } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Link } from '@/components/Link';
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

type FieldErrors = Partial<Record<keyof AddressFields, string>>;

const emptyAddress: AddressFields = {
  firstName: '', lastName: '', company: '', address1: '', address2: '',
  city: '', state: '', postalCode: '', country: 'DE', phone: '',
};

const REQUIRED_FIELDS: (keyof AddressFields)[] = ['firstName', 'lastName', 'address1', 'city', 'postalCode'];

const _FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  address1: 'Address',
  city: 'City',
  postalCode: 'Postal Code',
};

function validateAddress(address: AddressFields, __: (s: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of REQUIRED_FIELDS) {
    if (!address[field].trim()) {
      errors[field] = __('This field is required');
    }
  }
  return errors;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="checkout-field-error">{error}</p>;
}

function AddressForm({
  address,
  onChange,
  label,
  errors,
  showErrors,
}: {
  address: AddressFields;
  onChange: (a: AddressFields) => void;
  label: string;
  errors: FieldErrors;
  showErrors: boolean;
}) {
  const __ = useBlankTranslations();
  const set = (field: keyof AddressFields, value: string) => onChange({ ...address, [field]: value });
  const err = (field: keyof AddressFields) => showErrors ? errors[field] : undefined;
  const errClass = (field: keyof AddressFields) => err(field) ? ' checkout-field-invalid' : '';

  return (
    <fieldset className="checkout-fieldset">
      <legend className="checkout-legend">{label}</legend>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('First Name')} *</label>
          <input className={`input${errClass('firstName')}`} value={address.firstName} onChange={(e) => set('firstName', e.target.value)} />
          <FieldError error={err('firstName')} />
        </div>
        <div className="checkout-field">
          <label className="label">{__('Last Name')} *</label>
          <input className={`input${errClass('lastName')}`} value={address.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <FieldError error={err('lastName')} />
        </div>
      </div>
      <div className="checkout-field">
        <label className="label">{__('Company')}</label>
        <input className="input" value={address.company} onChange={(e) => set('company', e.target.value)} />
      </div>
      <div className="checkout-field">
        <label className="label">{__('Address')} *</label>
        <input className={`input${errClass('address1')}`} value={address.address1} onChange={(e) => set('address1', e.target.value)} />
        <FieldError error={err('address1')} />
      </div>
      <div className="checkout-field">
        <label className="label">{__('Address line 2')}</label>
        <input className="input" value={address.address2} onChange={(e) => set('address2', e.target.value)} />
      </div>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('City')} *</label>
          <input className={`input${errClass('city')}`} value={address.city} onChange={(e) => set('city', e.target.value)} />
          <FieldError error={err('city')} />
        </div>
        <div className="checkout-field">
          <label className="label">{__('Postal Code')} *</label>
          <input className={`input${errClass('postalCode')}`} value={address.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
          <FieldError error={err('postalCode')} />
        </div>
      </div>
      <div className="checkout-row">
        <div className="checkout-field">
          <label className="label">{__('Country')} *</label>
          <select className="input" value={address.country} onChange={(e) => set('country', e.target.value)}>
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
  const [sessionId] = useState(() => typeof window !== 'undefined' ? getCartSessionId() : '');
  const [shipping, setShipping] = useState<AddressFields>(emptyAddress);
  const [customerNote, setCustomerNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [selectedShippingRate, setSelectedShippingRate] = useState<string | undefined>();

  const fieldErrors = validateAddress(shipping, __);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const { data: cart } = trpc.storeCart.get.useQuery(
    { sessionId: sessionId || undefined },
    { staleTime: 10_000 },
  );

  const { data: totals } = trpc.storeCheckout.calculateTotals.useQuery(
    { country: shipping.country, shippingRateId: selectedShippingRate },
    { enabled: !!shipping.country },
  );

  const { data: shippingOptions } = trpc.storeCheckout.getShippingOptions.useQuery(
    { country: shipping.country },
    { enabled: !!shipping.country },
  );

  const placeOrder = trpc.storeCheckout.placeOrder.useMutation({
    onSuccess: (result) => {
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        window.location.href = `/account/orders/${result.orderId}`;
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowErrors(true);

    if (hasFieldErrors) return;

    placeOrder.mutate({
      shippingAddress: {
        firstName: shipping.firstName.trim(),
        lastName: shipping.lastName.trim(),
        company: shipping.company.trim() || undefined,
        address1: shipping.address1.trim(),
        address2: shipping.address2.trim() || undefined,
        city: shipping.city.trim(),
        state: shipping.state.trim() || undefined,
        postalCode: shipping.postalCode.trim(),
        country: shipping.country,
        phone: shipping.phone.trim() || undefined,
      },
      shippingRateId: selectedShippingRate,
      customerNote: customerNote.trim() || undefined,
    });
  }

  const subtotal = totals?.subtotalCents ?? cart?.subtotalCents ?? 0;
  const shippingCost = totals?.shippingCents ?? 0;
  const tax = totals?.taxCents ?? 0;
  const total = totals?.totalCents ?? subtotal;

  return (
    <form onSubmit={handleSubmit} className="cart-page" noValidate>
      <div className="checkout-main">
        <AddressForm
          address={shipping}
          onChange={setShipping}
          label={__('Shipping Address')}
          errors={fieldErrors}
          showErrors={showErrors}
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
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
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
