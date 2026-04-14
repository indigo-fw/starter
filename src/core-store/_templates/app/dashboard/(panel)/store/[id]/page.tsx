'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductType = 'simple' | 'variable' | 'digital' | 'subscription' | 'bundle';
type ProductStatus = 'draft' | 'published' | 'archived';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK'] as const;
const RELATION_TYPES = ['related', 'upsell', 'crosssell'] as const;

const STATUS_BADGE: Record<ProductStatus, string> = {
  draft: 'badge-draft',
  published: 'badge-published',
  archived: 'bg-(--surface-secondary) text-(--text-muted)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToEur(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '';
  return (cents / 100).toFixed(2);
}

function eurToCents(val: string): number | undefined {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return undefined;
  return Math.round(n * 100);
}

function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '\u2014';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Inner form (remounts via key when data loads)
// ---------------------------------------------------------------------------

interface ProductData {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  status: ProductStatus;
  description: string | null;
  shortDescription: string | null;
  priceCents: number | null;
  comparePriceCents: number | null;
  currency: string;
  sku: string | null;
  trackInventory: boolean;
  stockQuantity: number | null;
  weightGrams: number | null;
  taxClass: string;
  requiresShipping: boolean;
  featuredImage: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  digitalFileUrl: string | null;
  downloadLimit: number | null;
  variants: Array<{
    id: string;
    name: string | null;
    sku: string | null;
    priceCents: number;
    comparePriceCents: number | null;
    stockQuantity: number;
    weightGrams: number | null;
    options: unknown;
    image: string | null;
  }>;
  categoryIds?: string[];
}

function ProductFormInner({ product }: { product: ProductData }) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();

  // ---- Basic info ----
  const [name, setName] = useState(product.name);
  const [type, setType] = useState<ProductType>(product.type);
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [shortDescription, setShortDescription] = useState(product.shortDescription ?? '');
  const [description, setDescription] = useState(product.description ?? '');

  // ---- Pricing ----
  const [priceEur, setPriceEur] = useState(centsToEur(product.priceCents));
  const [comparePriceEur, setComparePriceEur] = useState(centsToEur(product.comparePriceCents));
  const [currency, setCurrency] = useState(product.currency || 'EUR');
  const [sku, setSku] = useState(product.sku ?? '');

  // ---- Inventory ----
  const [trackInventory, setTrackInventory] = useState(product.trackInventory);
  const [stockQuantity, setStockQuantity] = useState(product.stockQuantity ?? 0);
  const [weightGrams, setWeightGrams] = useState<number | ''>(product.weightGrams ?? '');
  const [requiresShipping, setRequiresShipping] = useState(product.requiresShipping);

  // ---- Digital ----
  const [digitalFileUrl, setDigitalFileUrl] = useState(product.digitalFileUrl ?? '');
  const [downloadLimit, setDownloadLimit] = useState<number | ''>(product.downloadLimit ?? '');

  // ---- SEO ----
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState(product.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(product.metaDescription ?? '');

  // ---- Featured image ----
  const [featuredImage, setFeaturedImage] = useState(product.featuredImage ?? '');

  // ---- Variants ----
  const [addingVariant, setAddingVariant] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantSku, setVariantSku] = useState('');
  const [variantPriceEur, setVariantPriceEur] = useState('');
  const [variantStock, setVariantStock] = useState(0);
  const [deleteVariantId, setDeleteVariantId] = useState<string | null>(null);

  // ---- Categories ----
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(product.categoryIds ?? []);

  // ---- Attributes ----
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [attrInitialized, setAttrInitialized] = useState(false);

  // ---- Related products ----
  const [relatedInputs, setRelatedInputs] = useState<Record<string, string>>({
    related: '',
    upsell: '',
    crosssell: '',
  });

  // ---- Delete ----
  const [showDelete, setShowDelete] = useState(false);

  // ---- Queries ----
  const categoriesQuery = trpc.storeProducts.listCategories.useQuery();
  const attributesQuery = trpc.storeAttributes.adminListAttributes.useQuery();
  const productAttrsQuery = trpc.storeAttributes.getProductAttributes.useQuery(
    { productId: product.id },
  );

  // Sync attribute values when data loads (onSuccess removed in TanStack Query v5)
  const productAttrsData = productAttrsQuery.data;
  if (productAttrsData && !attrInitialized) {
    const map: Record<string, string> = {};
    for (const a of productAttrsData) map[a.attributeId] = a.value;
    setAttrValues(map);
    setAttrInitialized(true);
  }
  const relatedQuery = trpc.storeRelations.adminGetRelated.useQuery({ productId: product.id });

  // ---- Mutations ----
  const updateProduct = trpc.storeProducts.update.useMutation({
    onSuccess: () => {
      toast.success(__('Product saved'));
      utils.storeProducts.adminGet.invalidate({ id: product.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProduct = trpc.storeProducts.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Product deleted'));
      router.push(adminPanel.storeProducts);
    },
    onError: (err) => toast.error(err.message),
  });

  const addVariant = trpc.storeProducts.addVariant.useMutation({
    onSuccess: () => {
      toast.success(__('Variant added'));
      utils.storeProducts.adminGet.invalidate({ id: product.id });
      setAddingVariant(false);
      resetVariantForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteVariantMut = trpc.storeProducts.deleteVariant.useMutation({
    onSuccess: () => {
      toast.success(__('Variant deleted'));
      utils.storeProducts.adminGet.invalidate({ id: product.id });
      setDeleteVariantId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const setProductAttrs = trpc.storeAttributes.setProductAttributes.useMutation({
    onSuccess: () => {
      toast.success(__('Attributes saved'));
      utils.storeAttributes.getProductAttributes.invalidate({ productId: product.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const setRelatedMut = trpc.storeRelations.adminSetRelated.useMutation({
    onSuccess: () => {
      toast.success(__('Related products saved'));
      utils.storeRelations.adminGetRelated.invalidate({ productId: product.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = updateProduct.isPending;

  function resetVariantForm() {
    setVariantName('');
    setVariantSku('');
    setVariantPriceEur('');
    setVariantStock(0);
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error(__('Name is required'));
      return;
    }
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      status,
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      priceCents: eurToCents(priceEur),
      comparePriceCents: eurToCents(comparePriceEur) ?? null,
      sku: sku || undefined,
      trackInventory,
      stockQuantity: trackInventory ? stockQuantity : undefined,
      weightGrams: weightGrams || null,
      requiresShipping,
      featuredImage: featuredImage || null,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      digitalFileUrl: type === 'digital' ? (digitalFileUrl || null) : undefined,
      downloadLimit: type === 'digital' && downloadLimit ? downloadLimit : null,
    });
  }

  function handleAddVariant() {
    if (!variantName.trim()) {
      toast.error(__('Variant name is required'));
      return;
    }
    addVariant.mutate({
      productId: product.id,
      name: variantName.trim(),
      sku: variantSku || undefined,
      priceCents: eurToCents(variantPriceEur) ?? 0,
      stockQuantity: variantStock,
      options: {},
    });
  }

  function handleSaveAttributes() {
    const attributes = Object.entries(attrValues)
      .filter(([, v]) => v.trim())
      .map(([attributeId, value]) => ({ attributeId, value: value.trim() }));
    setProductAttrs.mutate({ productId: product.id, attributes });
  }

  function handleSaveRelated(relationType: typeof RELATION_TYPES[number]) {
    const ids = (relatedInputs[relationType] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setRelatedMut.mutate({
      productId: product.id,
      type: relationType,
      relatedProductIds: ids,
    });
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  const showInventory = type === 'simple' || type === 'variable';
  const showDigital = type === 'digital';
  const showVariants = type === 'variable';

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
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Edit Product')}</h1>
            <span className={cn('badge text-xs', STATUS_BADGE[status])}>
              {__(status.charAt(0).toUpperCase() + status.slice(1))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDelete(true)}
              className="btn btn-danger"
            >
              <Trash2 className="h-4 w-4" />
              {__('Delete')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn btn-primary disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {__('Save')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner space-y-4 pt-4">

          {/* Basic Info */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Basic Info')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Name')} *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Status')}</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProductStatus)}
                    className="input w-full"
                  >
                    <option value="draft">{__('Draft')}</option>
                    <option value="published">{__('Published')}</option>
                    <option value="archived">{__('Archived')}</option>
                  </select>
                </div>
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

          {/* Variants */}
          {showVariants && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Variants')}</h3>
                <button
                  onClick={() => setAddingVariant(true)}
                  className="btn btn-secondary text-sm"
                >
                  <Plus className="h-4 w-4" />
                  {__('Add Variant')}
                </button>
              </div>

              {product.variants.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-(--border-primary)">
                  <table className="w-full">
                    <thead className="table-thead">
                      <tr>
                        <th className="table-th">{__('Name')}</th>
                        <th className="table-th w-24">{__('SKU')}</th>
                        <th className="table-th w-28">{__('Price')}</th>
                        <th className="table-th w-20">{__('Stock')}</th>
                        <th className="table-th w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((v) => (
                        <tr key={v.id} className="table-tr hover:bg-(--surface-secondary)">
                          <td className="table-td font-medium text-(--text-primary)">{v.name || '\u2014'}</td>
                          <td className="table-td text-xs text-(--text-muted)">{v.sku || '\u2014'}</td>
                          <td className="table-td text-sm">{formatPrice(v.priceCents, currency)}</td>
                          <td className="table-td text-sm text-(--text-secondary)">{v.stockQuantity}</td>
                          <td className="table-td table-td-actions">
                            <button
                              onClick={() => setDeleteVariantId(v.id)}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                              title={__('Delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {product.variants.length === 0 && !addingVariant && (
                <p className="text-center text-sm text-(--text-muted)">
                  {__('No variants yet. Add variants to offer different options.')}
                </p>
              )}

              {addingVariant && (
                <div className="rounded-lg border border-(--border-primary) bg-(--surface-primary) p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-(--text-primary)">{__('New Variant')}</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Name')} *</label>
                      <input
                        type="text"
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                        className="input w-full"
                        placeholder={__('e.g. Large / Red')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('SKU')}</label>
                      <input
                        type="text"
                        value={variantSku}
                        onChange={(e) => setVariantSku(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={variantPriceEur}
                        onChange={(e) => setVariantPriceEur(e.target.value)}
                        className="input w-full"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{__('Stock')}</label>
                      <input
                        type="number"
                        min="0"
                        value={variantStock}
                        onChange={(e) => setVariantStock(parseInt(e.target.value) || 0)}
                        className="input w-full"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setAddingVariant(false); resetVariantForm(); }}
                      className="btn btn-secondary text-sm"
                    >
                      {__('Cancel')}
                    </button>
                    <button
                      onClick={handleAddVariant}
                      disabled={addVariant.isPending}
                      className="btn btn-primary text-sm disabled:opacity-50"
                    >
                      {addVariant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {__('Add')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Categories */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Categories')}</h3>
            {categoriesQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
            ) : !categoriesQuery.data?.length ? (
              <p className="text-sm text-(--text-muted)">{__('No categories defined.')}</p>
            ) : (
              <div className="space-y-2">
                {categoriesQuery.data.map((cat) => (
                  <label key={cat.id} className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="h-4 w-4 rounded border-(--border-primary)"
                    />
                    {cat.name}
                  </label>
                ))}
                <p className="text-xs text-(--text-muted) mt-2">
                  {__('Category assignment is saved with the product. Extend this section to call a category update mutation.')}
                </p>
              </div>
            )}
          </div>

          {/* Attributes */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Attributes')}</h3>
            {attributesQuery.isLoading || productAttrsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
            ) : !attributesQuery.data?.length ? (
              <p className="text-sm text-(--text-muted)">{__('No attributes defined.')}</p>
            ) : (
              <div className="space-y-3">
                {attributesQuery.data.map((attr) => (
                  <div key={attr.id}>
                    <label className="text-sm font-medium text-(--text-secondary) mb-1 block">{attr.name}</label>
                    {attr.type === 'select' && attr.values?.length ? (
                      <select
                        value={attrValues[attr.id] ?? ''}
                        onChange={(e) => setAttrValues((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                        className="input w-full"
                      >
                        <option value="">{__('-- Select --')}</option>
                        {attr.values.map((v: string) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={attr.type === 'number' ? 'number' : 'text'}
                        value={attrValues[attr.id] ?? ''}
                        onChange={(e) => setAttrValues((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                        className="input w-full"
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={handleSaveAttributes}
                  disabled={setProductAttrs.isPending}
                  className="btn btn-secondary text-sm"
                >
                  {setProductAttrs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {__('Save Attributes')}
                </button>
              </div>
            )}
          </div>

          {/* Related Products */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-(--text-muted)">{__('Related Products')}</h3>
            {relatedQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
            ) : (
              <div className="space-y-4">
                {RELATION_TYPES.map((relType) => {
                  const current = (relatedQuery.data as Record<string, Array<{ id: string; name: string }>> | undefined)?.[relType] ?? [];
                  return (
                    <div key={relType} className="space-y-2">
                      <label className="text-sm font-medium text-(--text-secondary) mb-1 block capitalize">{__(relType)}</label>
                      {current.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {current.map((p) => (
                            <span key={p.id} className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs text-(--text-secondary)">
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={relatedInputs[relType] ?? ''}
                          onChange={(e) => setRelatedInputs((prev) => ({ ...prev, [relType]: e.target.value }))}
                          className="input flex-1"
                          placeholder={__('Comma-separated product IDs')}
                        />
                        <button
                          onClick={() => handleSaveRelated(relType)}
                          disabled={setRelatedMut.isPending}
                          className="btn btn-secondary text-sm"
                        >
                          {__('Save')}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-(--text-muted)">
                  {__('Tip: Replace comma-separated IDs with a product search/select component for better UX.')}
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Delete product dialog */}
      <ConfirmDialog
        open={showDelete}
        title={__('Delete product?')}
        message={__('Delete "{name}"? This action cannot be undone.', { name: product.name })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => deleteProduct.mutate({ id: product.id })}
        onCancel={() => setShowDelete(false)}
      />

      {/* Delete variant dialog */}
      <ConfirmDialog
        open={!!deleteVariantId}
        title={__('Delete variant?')}
        message={__('This variant will be permanently removed.')}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => { if (deleteVariantId) deleteVariantMut.mutate({ id: deleteVariantId }); }}
        onCancel={() => setDeleteVariantId(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper — loading + data fetch
// ---------------------------------------------------------------------------

export default function ProductEditPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();

  const productQuery = trpc.storeProducts.adminGet.useQuery(
    { id: params.id },
    { enabled: !!params.id },
  );

  if (productQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="py-24 text-center text-sm text-(--text-muted)">
        {__('Product not found.')}
      </div>
    );
  }

  return (
    <ProductFormInner
      key={productQuery.data.id}
      product={productQuery.data as unknown as ProductData}
    />
  );
}
