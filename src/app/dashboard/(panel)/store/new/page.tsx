'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Save,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { toast } from '@/store/toast-store';

export default function NewProductPage() {
  const __ = useAdminTranslations();
  const router = useRouter();

  const [name, setName] = useState('');
  const [type, setType] = useState<'simple' | 'variable' | 'digital' | 'subscription'>('simple');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [comparePriceCents, setComparePriceCents] = useState(0);
  const [sku, setSku] = useState('');
  const [trackInventory, setTrackInventory] = useState(false);
  const [stockQuantity, setStockQuantity] = useState(0);
  const [weightGrams, setWeightGrams] = useState(0);
  const [taxClass, setTaxClass] = useState('standard');
  const [requiresShipping, setRequiresShipping] = useState(true);
  const [featuredImage, setFeaturedImage] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [digitalFileUrl, setDigitalFileUrl] = useState('');
  const [downloadLimit, setDownloadLimit] = useState(0);

  const createProduct = trpc.storeProducts.create.useMutation({
    onSuccess: (data) => {
      toast.success(__('Product created'));
      router.push(adminPanel.storeProductDetail(data.id));
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = createProduct.isPending;

  function handleSave() {
    if (!name.trim()) { toast.error(__('Name is required')); return; }
    createProduct.mutate({
      name: name.trim(),
      type,
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      priceCents: priceCents || undefined,
      comparePriceCents: comparePriceCents || undefined,
      sku: sku || undefined,
      trackInventory,
      stockQuantity,
      weightGrams: weightGrams || undefined,
      taxClass,
      requiresShipping,
      featuredImage: featuredImage || undefined,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      digitalFileUrl: digitalFileUrl || undefined,
      downloadLimit: downloadLimit || undefined,
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
      <main className="dash-main"><div className="dash-inner">
        {/* Product Details */}
        <div className="card mt-4 p-6">
          <h2 className="h2">{__('Product Details')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{__('Name')} *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" />
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
                value={priceCents ? (priceCents / 100).toFixed(2) : ''}
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
              <label className="label">{__('Featured Image URL')}</label>
              <input type="text" value={featuredImage} onChange={(e) => setFeaturedImage(e.target.value)} className="input" placeholder="https://..." />
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
        {type === 'digital' && (
          <div className="card mt-4 p-6">
            <h2 className="h2">{__('Digital Product')}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">{__('File URL')}</label>
                <input type="text" value={digitalFileUrl} onChange={(e) => setDigitalFileUrl(e.target.value)} className="input" placeholder="https://..." />
              </div>
              <div>
                <label className="label">{__('Download Limit')}</label>
                <input type="number" value={downloadLimit || ''} onChange={(e) => setDownloadLimit(parseInt(e.target.value) || 0)} className="input" placeholder={__('Unlimited')} />
              </div>
            </div>
          </div>
        )}
      </div></main>
    </>
  );
}
