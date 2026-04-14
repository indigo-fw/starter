'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Save,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

type ProductType = 'simple' | 'variable' | 'digital' | 'subscription';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK'] as const;

export default function NewProductPage() {
  const __ = useAdminTranslations();
  const router = useRouter();

  // Basic info
  const [name, setName] = useState('');
  const [type, setType] = useState<ProductType>('simple');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');

  // Pricing
  const [priceEur, setPriceEur] = useState('');
  const [comparePriceEur, setComparePriceEur] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [sku, setSku] = useState('');

  // Inventory
  const [trackInventory, setTrackInventory] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [weightGrams, setWeightGrams] = useState<number | ''>('');
  const [requiresShipping, setRequiresShipping] = useState(true);

  // Digital
  const [digitalFileUrl, setDigitalFileUrl] = useState('');
  const [downloadLimit, setDownloadLimit] = useState<number | ''>('');

  // SEO
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  // Featured image
  const [featuredImage, setFeaturedImage] = useState('');

  const createProduct = trpc.storeProducts.create.useMutation({
    onSuccess: (data) => {
      toast.success(__('Product created'));
      router.push(adminPanel.storeProductDetail(data.id));
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = createProduct.isPending;

  function eurToCents(val: string): number | undefined {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return undefined;
    return Math.round(n * 100);
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error(__('Name is required'));
      return;
    }
    createProduct.mutate({
      name: name.trim(),
      type,
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      priceCents: eurToCents(priceEur),
      comparePriceCents: eurToCents(comparePriceEur),
      currency: currency !== 'EUR' ? currency : undefined,
      sku: sku || undefined,
      trackInventory,
      stockQuantity: trackInventory ? stockQuantity : undefined,
      weightGrams: weightGrams || undefined,
      requiresShipping,
      featuredImage: featuredImage || undefined,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      digitalFileUrl: type === 'digital' ? (digitalFileUrl || undefined) : undefined,
      downloadLimit: type === 'digital' && downloadLimit ? downloadLimit : undefined,
    });
  }

  const showInventory = type === 'simple' || type === 'variable';
  const showDigital = type === 'digital';

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.storeProducts}
              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('New Product')}</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {__('Create')}
          </button>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner space-y-4 pt-4">

          {/* Basic Info */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Basic Info')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Name')} *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input w-full"
                  placeholder={__('Product name')}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Type')}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ProductType)}
                  className="input w-full"
                >
                  <option value="simple">{__('Simple')}</option>
                  <option value="variable">{__('Variable')}</option>
                  <option value="digital">{__('Digital')}</option>
                  <option value="subscription">{__('Subscription')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Short Description')}</label>
                <textarea
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  className="input w-full"
                  rows={2}
                  maxLength={500}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Description')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input w-full"
                  rows={5}
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Pricing')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Price')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceEur}
                    onChange={(e) => setPriceEur(e.target.value)}
                    className="input w-full"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Compare Price')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={comparePriceEur}
                    onChange={(e) => setComparePriceEur(e.target.value)}
                    className="input w-full"
                    placeholder={__('Original price for discount display')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Currency')}</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="input w-full"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('SKU')}</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="input w-full"
                    placeholder={__('Optional stock keeping unit')}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Inventory */}
          {showInventory && (
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Inventory')}</h3>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="h-4 w-4 rounded border-(--border-primary)"
                  />
                  {__('Track Inventory')}
                </label>
                {trackInventory && (
                  <div>
                    <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Stock Quantity')}</label>
                    <input
                      type="number"
                      min="0"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(parseInt(e.target.value) || 0)}
                      className="input w-full"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Weight (grams)')}</label>
                  <input
                    type="number"
                    min="0"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value ? parseInt(e.target.value) : '')}
                    className="input w-full"
                    placeholder={__('Optional')}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--text-secondary)">
                  <input
                    type="checkbox"
                    checked={requiresShipping}
                    onChange={(e) => setRequiresShipping(e.target.checked)}
                    className="h-4 w-4 rounded border-(--border-primary)"
                  />
                  {__('Requires Shipping')}
                </label>
              </div>
            </div>
          )}

          {/* Digital */}
          {showDigital && (
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Digital Product')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('File URL')}</label>
                  <input
                    type="text"
                    value={digitalFileUrl}
                    onChange={(e) => setDigitalFileUrl(e.target.value)}
                    className="input w-full"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Download Limit')}</label>
                  <input
                    type="number"
                    min="0"
                    value={downloadLimit}
                    onChange={(e) => setDownloadLimit(e.target.value ? parseInt(e.target.value) : '')}
                    className="input w-full"
                    placeholder={__('Unlimited')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SEO (collapsible) */}
          <div className="card">
            <button
              type="button"
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex w-full items-center justify-between p-6 text-left"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('SEO')}</h3>
              <ChevronDown className={cn('h-4 w-4 text-(--text-muted) transition-transform', seoOpen && 'rotate-180')} />
            </button>
            {seoOpen && (
              <div className="px-6 pb-6 space-y-3">
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Meta Title')}</label>
                  <input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    className="input w-full"
                    maxLength={255}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Meta Description')}</label>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    className="input w-full"
                    rows={3}
                    maxLength={500}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Featured Image */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Featured Image')}</h3>
            <div>
              <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Image URL')}</label>
              <input
                type="text"
                value={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.value)}
                className="input w-full"
                placeholder="https://..."
              />
              <p className="text-xs text-(--text-muted) mt-1">
                {__('Tip: Projects can upgrade this to a MediaPickerButton for file uploads.')}
              </p>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
