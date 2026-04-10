'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
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
import { MediaPickerButton } from '@/core/components/media/MediaPickerButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VariantFormData {
  name: string;
  sku: string;
  priceCents: number;
  comparePriceCents: number | undefined;
  stockQuantity: number;
  weightGrams: number | undefined;
  options: Record<string, string>;
  image: string;
}

function emptyVariant(): VariantFormData {
  return { name: '', sku: '', priceCents: 0, comparePriceCents: undefined, stockQuantity: 0, weightGrams: undefined, options: {}, image: '' };
}

function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Inner form (remounts via key)
// ---------------------------------------------------------------------------

interface ProductData {
  id: string;
  name: string;
  slug: string;
  type: 'simple' | 'variable' | 'digital' | 'subscription';
  status: 'draft' | 'published' | 'archived';
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
  subscriptionPlanId: string | null;
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
}

function ProductFormInner({ product }: { product: ProductData }) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();

  // Form state
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [type, setType] = useState(product.type);
  const [status, setStatus] = useState(product.status);
  const [description, setDescription] = useState(product.description ?? '');
  const [shortDescription, setShortDescription] = useState(product.shortDescription ?? '');
  const [priceCents, setPriceCents] = useState<number>(product.priceCents ?? 0);
  const [comparePriceCents, setComparePriceCents] = useState<number>(product.comparePriceCents ?? 0);
  const [sku, setSku] = useState(product.sku ?? '');
  const [trackInventory, setTrackInventory] = useState(product.trackInventory);
  const [stockQuantity, setStockQuantity] = useState(product.stockQuantity ?? 0);
  const [weightGrams, setWeightGrams] = useState<number>(product.weightGrams ?? 0);
  const [taxClass, setTaxClass] = useState(product.taxClass);
  const [requiresShipping, setRequiresShipping] = useState(product.requiresShipping);
  const [featuredImage, setFeaturedImage] = useState(product.featuredImage ?? '');
  const [metaTitle, setMetaTitle] = useState(product.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(product.metaDescription ?? '');
  const [digitalFileUrl, setDigitalFileUrl] = useState(product.digitalFileUrl ?? '');
  const [downloadLimit, setDownloadLimit] = useState<number>(product.downloadLimit ?? 0);

  // Delete state
  const [showDelete, setShowDelete] = useState(false);

  // Variant state
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariant, setNewVariant] = useState<VariantFormData>(emptyVariant());
  const [deleteVariantId, setDeleteVariantId] = useState<string | null>(null);

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
      setNewVariant(emptyVariant());
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteVariant = trpc.storeProducts.deleteVariant.useMutation({
    onSuccess: () => {
      toast.success(__('Variant deleted'));
      utils.storeProducts.adminGet.invalidate({ id: product.id });
      setDeleteVariantId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = updateProduct.isPending;

  // Field validation
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = __('Name is required');
  if (priceCents < 0) errors.priceCents = __('Price cannot be negative');
  if (type === 'digital' && !digitalFileUrl.trim()) errors.digitalFileUrl = __('File URL is required for digital products');

  function handleSave() {
    if (Object.keys(errors).length > 0) {
      toast.error(Object.values(errors)[0]!);
      return; }
    updateProduct.mutate({
      id: product.id,
      name: name.trim(),
      slug: slug.trim() || undefined,
      status,
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      priceCents: priceCents || undefined,
      comparePriceCents: comparePriceCents || null,
      sku: sku || undefined,
      trackInventory,
      stockQuantity,
      weightGrams: weightGrams || null,
      taxClass,
      requiresShipping,
      featuredImage: featuredImage || null,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      digitalFileUrl: digitalFileUrl || null,
      downloadLimit: downloadLimit || null,
    });
  }

  function handleAddVariant() {
    if (!newVariant.name.trim()) { toast.error(__('Variant name is required')); return; }
    addVariant.mutate({
      productId: product.id,
      name: newVariant.name.trim(),
      sku: newVariant.sku || undefined,
      priceCents: newVariant.priceCents,
      comparePriceCents: newVariant.comparePriceCents,
      stockQuantity: newVariant.stockQuantity,
      weightGrams: newVariant.weightGrams,
      options: newVariant.options,
      image: newVariant.image || undefined,
    });
  }

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
              disabled={isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {__('Save')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
        {/* Main form */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Product Details')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{__('Name')} *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={cn('input', errors.name && 'border-red-500')} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label">{__('Slug')}</label>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">{__('Type')}</label>
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="select">
                <option value="simple">{__('Simple')}</option>
                <option value="variable">{__('Variable')}</option>
                <option value="digital">{__('Digital')}</option>
                <option value="subscription">{__('Subscription')}</option>
              </select>
            </div>
            <div>
              <label className="label">{__('Status')}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="select">
                <option value="draft">{__('Draft')}</option>
                <option value="published">{__('Published')}</option>
                <option value="archived">{__('Archived')}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">{__('Short Description')}</label>
              <input type="text" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} className="input" maxLength={500} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">{__('Description')}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="textarea" rows={6} />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Pricing')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{__('Price (EUR)')}</label>
              <input
                type="number"
                step="0.01"
                value={(priceCents / 100).toFixed(2)}
                onChange={(e) => setPriceCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                className="input"
              />
            </div>
            <div>
              <label className="label">{__('Compare Price (EUR)')}</label>
              <input
                type="number"
                step="0.01"
                value={comparePriceCents ? (comparePriceCents / 100).toFixed(2) : ''}
                onChange={(e) => setComparePriceCents(e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0)}
                className="input"
                placeholder={__('Original price for discount display')}
              />
            </div>
            <div>
              <label className="label">{__('SKU')}</label>
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">{__('Tax Class')}</label>
              <select value={taxClass} onChange={(e) => setTaxClass(e.target.value)} className="select">
                <option value="standard">{__('Standard')}</option>
                <option value="reduced">{__('Reduced')}</option>
                <option value="zero">{__('Zero')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Inventory & Shipping */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Inventory & Shipping')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--text-secondary)">
                <input type="checkbox" checked={trackInventory} onChange={(e) => setTrackInventory(e.target.checked)} className="h-4 w-4 rounded border-(--border-primary)" />
                {__('Track Inventory')}
              </label>
            </div>
            <div>
              <label className="label">{__('Stock Quantity')}</label>
              <input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(parseInt(e.target.value) || 0)} className="input" disabled={!trackInventory} />
            </div>
            <div>
              <label className="label">{__('Weight (grams)')}</label>
              <input type="number" value={weightGrams || ''} onChange={(e) => setWeightGrams(parseInt(e.target.value) || 0)} className="input" />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-(--text-secondary)">
                <input type="checkbox" checked={requiresShipping} onChange={(e) => setRequiresShipping(e.target.checked)} className="h-4 w-4 rounded border-(--border-primary)" />
                {__('Requires Shipping')}
              </label>
            </div>
          </div>
        </div>

        {/* Media & SEO */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Media & SEO')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">{__('Featured Image')}</label>
              <MediaPickerButton
                value={featuredImage || undefined}
                onChange={(url) => setFeaturedImage(url)}
              />
            </div>
            <div>
              <label className="label">{__('Meta Title')}</label>
              <input type="text" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="input" maxLength={255} />
            </div>
            <div>
              <label className="label">{__('Meta Description')}</label>
              <input type="text" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} className="input" maxLength={500} />
            </div>
          </div>
        </div>

        {/* Digital product fields */}
        {(type === 'digital') && (
          <div className="card mt-4 p-6">
            <h2 className="h2">{__('Digital Product')}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">{__('File URL')} *</label>
                <input type="text" value={digitalFileUrl} onChange={(e) => setDigitalFileUrl(e.target.value)} className={cn('input', errors.digitalFileUrl && 'border-red-500')} placeholder="https://..." />
                {errors.digitalFileUrl && <p className="text-xs text-red-500 mt-1">{errors.digitalFileUrl}</p>}
              </div>
              <div>
                <label className="label">{__('Download Limit')}</label>
                <input type="number" value={downloadLimit || ''} onChange={(e) => setDownloadLimit(parseInt(e.target.value) || 0)} className="input" placeholder={__('Unlimited')} />
              </div>
            </div>
          </div>
        )}

        {/* Variants (for variable products) */}
        {type === 'variable' && (
          <div className="card mt-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="h2">{__('Variants')}</h2>
              <button onClick={() => setAddingVariant(true)} className="btn btn-secondary">
                <Plus className="h-4 w-4" />
                {__('Add Variant')}
              </button>
            </div>

            {product.variants.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-lg border border-(--border-primary)">
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
                        <td className="table-td font-medium text-(--text-primary)">{v.name}</td>
                        <td className="table-td text-xs text-(--text-muted)">{v.sku || '—'}</td>
                        <td className="table-td text-sm">{formatPrice(v.priceCents)}</td>
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
              <p className="mt-4 text-center text-sm text-(--text-muted)">
                {__('No variants yet. Add variants to offer different options.')}
              </p>
            )}

            {/* Add variant form */}
            {addingVariant && (
              <div className="mt-4 rounded-lg border border-(--border-primary) bg-(--surface-primary) p-4">
                <h3 className="text-sm font-semibold text-(--text-primary)">{__('New Variant')}</h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">{__('Name')} *</label>
                    <input type="text" value={newVariant.name} onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })} className="input" placeholder={__('e.g. Large / Red')} />
                  </div>
                  <div>
                    <label className="label">{__('SKU')}</label>
                    <input type="text" value={newVariant.sku} onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value })} className="input" />
                  </div>
                  <div>
                    <label className="label">{__('Price (EUR)')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={(newVariant.priceCents / 100).toFixed(2)}
                      onChange={(e) => setNewVariant({ ...newVariant, priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">{__('Stock')}</label>
                    <input type="number" value={newVariant.stockQuantity} onChange={(e) => setNewVariant({ ...newVariant, stockQuantity: parseInt(e.target.value) || 0 })} className="input" />
                  </div>
                  <div>
                    <label className="label">{__('Weight (g)')}</label>
                    <input type="number" value={newVariant.weightGrams ?? ''} onChange={(e) => setNewVariant({ ...newVariant, weightGrams: parseInt(e.target.value) || undefined })} className="input" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => { setAddingVariant(false); setNewVariant(emptyVariant()); }} className="btn btn-secondary">{__('Cancel')}</button>
                  <button onClick={handleAddVariant} disabled={addVariant.isPending} className="btn btn-primary disabled:opacity-50">
                    {addVariant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {__('Add')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
          onConfirm={() => { if (deleteVariantId) deleteVariant.mutate({ id: deleteVariantId }); }}
          onCancel={() => setDeleteVariantId(null)}
        />
      </div></main>
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
