'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Truck, AlertCircle, ShoppingBag, ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice, getCartSessionId } from '@/core-store/lib/store-utils';
import '@/core-store/components/cart/store-cart.css';

/* ── Constants ───────────────────────────────────────────────────────── */

const COUNTRY_CODES = [
  'AT', 'AU', 'BE', 'BG', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK',
  'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LV', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE',
  'SI', 'SK', 'US',
] as const;

/** Resolve display name using the browser's Intl API — no hardcoded English names. */
function getCountryName(code: string, locale?: string): string {
  try {
    return new Intl.DisplayNames([locale ?? navigator.language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-(--text-primary) text-sm outline-none focus:border-brand-400';

const LABEL_CLS = 'text-sm font-medium text-(--text-secondary)';

type AddressFields = {
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
};

const EMPTY_ADDRESS: AddressFields = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
};

const REQUIRED_FIELDS: (keyof AddressFields)[] = [
  'firstName',
  'lastName',
  'address1',
  'city',
  'postalCode',
  'country',
];

/* ── Component ───────────────────────────────────────────────────────── */

export default function CheckoutPage() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.replace('/login?callbackURL=/checkout');
    }
  }, [session, sessionLoading, router]);

  const [sessionId] = useState(() =>
    typeof window !== 'undefined' ? getCartSessionId() : '',
  );

  // Form state
  const [shipping, setShipping] = useState<AddressFields>({ ...EMPTY_ADDRESS });
  const [shippingRateId, setShippingRateId] = useState<string | undefined>();
  const [customerNote, setCustomerNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddressFields, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountCents: number; type: string } | null>(null);
  const [discountError, setDiscountError] = useState('');

  // Cart
  const { data: cart, isLoading: cartLoading } = trpc.storeCart.get.useQuery(
    { sessionId: sessionId || undefined },
    { refetchOnWindowFocus: false },
  );

  const currency = cart?.currency ?? 'EUR';

  // Shipping options — refetch when country changes
  const { data: shippingOptions, isLoading: shippingLoading } =
    trpc.storeCheckout.getShippingOptions.useQuery(
      { country: shipping.country },
      { enabled: shipping.country.length === 2 },
    );

  // Auto-select first shipping option
  useEffect(() => {
    if (shippingOptions && shippingOptions.length > 0 && !shippingRateId) {
      setShippingRateId(shippingOptions[0]!.rateId);
    }
  }, [shippingOptions, shippingRateId]);

  // Reset shipping rate when country changes
  useEffect(() => {
    setShippingRateId(undefined);
  }, [shipping.country]);

  // Totals — refetch when country / shipping rate changes
  const { data: totals, isLoading: totalsLoading } =
    trpc.storeCheckout.calculateTotals.useQuery(
      {
        country: shipping.country,
        shippingRateId: shippingRateId ?? undefined,
      },
      { enabled: shipping.country.length === 2 },
    );

  // Place order
  const placeOrder = trpc.storeCheckout.placeOrder.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        router.push(`/account/orders/${data.orderId}?success=true`);
      }
    },
  });

  // Discount code validation
  const utils = trpc.useUtils();
  const [discountValidating, setDiscountValidating] = useState(false);

  async function handleApplyDiscount() {
    if (!discountCode.trim()) return;
    const subtotal = cart?.subtotalCents ?? 0;
    setDiscountValidating(true);
    try {
      const data = await utils.storeDiscounts.validate.fetch({
        code: discountCode.trim(),
        subtotalCents: subtotal,
        currency,
      });
      setAppliedDiscount({ code: data.code, discountCents: data.discountCents, type: data.type });
      setDiscountError('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid discount code';
      setDiscountError(message);
      setAppliedDiscount(null);
    } finally {
      setDiscountValidating(false);
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  }

  /* ── Validation ──────────────────────────────────────────────────── */

  const validate = useCallback((): boolean => {
    const errors: Partial<Record<keyof AddressFields, string>> = {};

    for (const field of REQUIRED_FIELDS) {
      if (!shipping[field].trim()) {
        errors[field] = __('This field is required');
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [shipping, __]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    if (!validate()) return;

    const addr = {
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
    };

    placeOrder.mutate({
      shippingAddress: addr,
      shippingRateId: shippingRateId ?? undefined,
      discountCode: appliedDiscount?.code || undefined,
      customerNote: customerNote.trim() || undefined,
    });
  }

  /* ── Re-validate on field change after first submit ───────────── */

  useEffect(() => {
    if (submitted) validate();
  }, [shipping, submitted, validate]);

  /* ── Address field renderer ──────────────────────────────────────── */

  const renderAddressFields = useCallback(
    (
      addr: AddressFields,
      setAddr: React.Dispatch<React.SetStateAction<AddressFields>>,
      prefix: string,
      errors?: Partial<Record<keyof AddressFields, string>>,
    ) => {
      function field(
        name: keyof AddressFields,
        label: string,
        opts?: { optional?: boolean; type?: string },
      ) {
        const err = errors?.[name];
        return (
          <div className="checkout-field" key={`${prefix}-${name}`}>
            <label className={LABEL_CLS} htmlFor={`${prefix}-${name}`}>
              {label}
              {opts?.optional && (
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> ({__('optional')})</span>
              )}
            </label>
            <input
              id={`${prefix}-${name}`}
              type={opts?.type ?? 'text'}
              className={`${INPUT_CLS}${err ? ' checkout-field-invalid' : ''}`}
              value={addr[name]}
              onChange={(e) => setAddr((prev) => ({ ...prev, [name]: e.target.value }))}
            />
            {err && <span className="checkout-field-error">{err}</span>}
          </div>
        );
      }

      return (
        <>
          <div className="checkout-row">
            {field('firstName', __('First Name'))}
            {field('lastName', __('Last Name'))}
          </div>
          {field('company', __('Company'), { optional: true })}
          {field('address1', __('Address'))}
          {field('address2', __('Address Line 2'), { optional: true })}
          <div className="checkout-row">
            {field('city', __('City'))}
            {field('state', __('State / Region'), { optional: true })}
          </div>
          <div className="checkout-row">
            {field('postalCode', __('Postal Code'))}
            <div className="checkout-field">
              <label className={LABEL_CLS} htmlFor={`${prefix}-country`}>
                {__('Country')}
              </label>
              <select
                id={`${prefix}-country`}
                className={`${INPUT_CLS}${errors?.country ? ' checkout-field-invalid' : ''}`}
                value={addr.country}
                onChange={(e) => setAddr((prev) => ({ ...prev, country: e.target.value }))}
              >
                <option value="">{__('Select country')}</option>
                {COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {getCountryName(code)}
                  </option>
                ))}
              </select>
              {errors?.country && <span className="checkout-field-error">{errors.country}</span>}
            </div>
          </div>
          {field('phone', __('Phone'), { optional: true, type: 'tel' })}
        </>
      );
    },
    [__],
  );

  /* ── Loading ─────────────────────────────────────────────────────── */

  if (cartLoading || sessionLoading || !session?.user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  /* ── Empty cart ───────────────────────────────────────────────────── */

  if (!cart || cart.items.length === 0) {
    return (
      <div className="store-empty">
        <ShoppingBag className="store-empty-icon" />
        <h2 className="store-empty-title">{__('Your cart is empty')}</h2>
        <p className="store-empty-text">
          {__('Add some items to your cart before checking out.')}
        </p>
        <Link href="/cart" className="btn-checkout" style={{ maxWidth: '16rem', marginTop: '1rem' }}>
          <ArrowLeft className="h-4 w-4" />
          {__('Back to Cart')}
        </Link>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <form className="cart-page" onSubmit={handleSubmit} noValidate>
      {/* ── Left: Checkout Form ──────────────────────────────────── */}
      <div className="checkout-main">
        <nav className="store-breadcrumb">
          <Link href="/cart">
            <ArrowLeft className="h-3.5 w-3.5" />
            {__('Back to Cart')}
          </Link>
        </nav>

        {/* Mutation error */}
        {placeOrder.error && (
          <div className="checkout-error">
            <AlertCircle className="h-4 w-4" style={{ flexShrink: 0 }} />
            {placeOrder.error.message}
          </div>
        )}

        {/* ── Shipping Address ──────────────────────────────────── */}
        <fieldset className="checkout-fieldset">
          <legend className="checkout-legend">{__('Shipping Address')}</legend>
          {renderAddressFields(shipping, setShipping, 'ship', fieldErrors)}
        </fieldset>

        {/* ── Shipping Method ───────────────────────────────────── */}
        {shipping.country && (
          <fieldset className="checkout-fieldset">
            <legend className="checkout-legend">
              <Truck className="h-4 w-4" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.375rem' }} />
              {__('Shipping Method')}
            </legend>

            {shippingLoading ? (
              <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {__('Loading shipping options...')}
              </div>
            ) : shippingOptions && shippingOptions.length > 0 ? (
              <div className="checkout-shipping-options">
                {shippingOptions.map((opt) => (
                  <label key={opt.rateId} className="checkout-shipping-option">
                    <input
                      type="radio"
                      name="shippingRate"
                      value={opt.rateId}
                      checked={shippingRateId === opt.rateId}
                      onChange={() => setShippingRateId(opt.rateId)}
                    />
                    <div className="checkout-shipping-option-info">
                      <span style={{ fontWeight: 600 }}>{opt.name}</span>
                      {opt.estimatedDays && (
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {__('%s business days').replace('%s', opt.estimatedDays)}
                        </span>
                      )}
                    </div>
                    <span className="checkout-shipping-option-price">
                      {opt.rateCents === 0 ? __('Free') : formatPrice(opt.rateCents, currency)}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                {__('No shipping options available for this country.')}
              </p>
            )}
          </fieldset>
        )}

        {/* ── Discount Code ────────────────────────────────────── */}
        <fieldset className="checkout-fieldset">
          <legend className="checkout-legend">{__('Discount Code')}</legend>
          <div className="checkout-field" style={{ marginTop: '0.5rem' }}>
            {appliedDiscount ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: 'oklch(0.60 0.16 145 / 0.08)', border: '1px solid oklch(0.60 0.16 145 / 0.2)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--color-success-600)' }}>
                  {appliedDiscount.code} — {appliedDiscount.type === 'percentage' ? `${appliedDiscount.discountCents}% off` : formatPrice(appliedDiscount.discountCents, currency) + ' off'}
                </span>
                <button type="button" onClick={handleRemoveDiscount} className="text-sm text-(--text-muted) hover:text-(--text-primary)">
                  {__('Remove')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  className={INPUT_CLS}
                  placeholder={__('Enter coupon code')}
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyDiscount())}
                />
                <button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={discountValidating || !discountCode.trim()}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {discountValidating ? __('Checking...') : __('Apply')}
                </button>
              </div>
            )}
            {discountError && <span className="checkout-field-error">{discountError}</span>}
          </div>
        </fieldset>

        {/* ── Customer Note ─────────────────────────────────────── */}
        <fieldset className="checkout-fieldset">
          <legend className="checkout-legend">{__('Order Notes')}</legend>
          <div className="checkout-field">
            <label className={LABEL_CLS} htmlFor="customerNote">
              {__('Additional notes')}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> ({__('optional')})</span>
            </label>
            <textarea
              id="customerNote"
              className={INPUT_CLS}
              rows={3}
              placeholder={__('Any special instructions for your order...')}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
            />
          </div>
        </fieldset>

        {/* ── Place Order ───────────────────────────────────────── */}
        <button
          type="submit"
          className="btn-checkout"
          disabled={placeOrder.isPending}
        >
          {placeOrder.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {__('Processing...')}
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              {__('Place Order')}
            </>
          )}
        </button>
      </div>

      {/* ── Right: Order Summary ────────────────────────────────── */}
      <div className="cart-summary">
        <h2 className="cart-summary-title">{__('Order Summary')}</h2>

        {/* Item list */}
        {cart.items.map((item) => (
          <div key={item.id} className="checkout-summary-item">
            <span>
              {item.productName}
              {item.quantity > 1 && ` x${item.quantity}`}
            </span>
            <span>{formatPrice(item.totalCents, currency)}</span>
          </div>
        ))}

        {/* Totals */}
        <div className="cart-summary-row" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <span>{__('Subtotal')}</span>
          <span>
            {totalsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ display: 'inline' }} />
            ) : (
              formatPrice(totals?.subtotalCents ?? cart.subtotalCents, currency)
            )}
          </span>
        </div>

        <div className="cart-summary-row">
          <span>{__('Shipping')}</span>
          <span>
            {!shipping.country ? (
              <span className="cart-summary-tbd">{__('Enter address')}</span>
            ) : totalsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ display: 'inline' }} />
            ) : totals?.shippingCents === 0 ? (
              __('Free')
            ) : (
              formatPrice(totals?.shippingCents, currency)
            )}
          </span>
        </div>

        <div className="cart-summary-row">
          <span>{__('Tax')}</span>
          <span>
            {!shipping.country ? (
              <span className="cart-summary-tbd">{__('Enter address')}</span>
            ) : totalsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ display: 'inline' }} />
            ) : (
              formatPrice(totals?.taxCents ?? 0, currency)
            )}
          </span>
        </div>

        {appliedDiscount && (
          <div className="cart-summary-row">
            <span>{__('Discount')}</span>
            <span style={{ color: 'var(--color-success-600)' }}>
              -{formatPrice(appliedDiscount.discountCents, currency)}
            </span>
          </div>
        )}

        <div className="cart-summary-row cart-summary-row-total">
          <span>{__('Total')}</span>
          <span>
            {totalsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ display: 'inline' }} />
            ) : totals ? (
              formatPrice(totals.totalCents, currency)
            ) : (
              formatPrice(cart.subtotalCents, currency)
            )}
          </span>
        </div>
      </div>
    </form>
  );
}
