'use client';

import { useState } from 'react';
import { Loader2, MapPin, Plus, Star, Trash2, Pencil, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations, dataTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import '@/core-store/components/cart/store-cart.css';

const _d = dataTranslations('General');

const COUNTRY_CODES = [
  'AT', 'AU', 'BE', 'BG', 'CA', 'CH', 'CY', 'CZ', 'DE', 'DK',
  'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IT',
  'LT', 'LV', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE',
  'SI', 'SK', 'US',
];

function getCountryName(code: string): string {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface AddressFormData {
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
  isDefault: boolean;
}

const emptyForm: AddressFormData = {
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
  isDefault: false,
};

function AddressForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initial: AddressFormData;
  onSubmit: (data: AddressFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const __ = useBlankTranslations();
  const [form, setForm] = useState<AddressFormData>(initial);

  const set = (key: keyof AddressFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-(--surface-secondary) border border-(--border-subtle) p-5 space-y-4">
      {/* Name row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('First Name')} *</label>
          <input
            type="text"
            required
            maxLength={100}
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Last Name')} *</label>
          <input
            type="text"
            required
            maxLength={100}
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      {/* Company */}
      <div>
        <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Company')}</label>
        <input
          type="text"
          maxLength={255}
          value={form.company}
          onChange={(e) => set('company', e.target.value)}
          className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {/* Address lines */}
      <div>
        <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Address')} *</label>
        <input
          type="text"
          required
          maxLength={255}
          value={form.address1}
          onChange={(e) => set('address1', e.target.value)}
          placeholder={__('Street address')}
          className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Address 2')}</label>
        <input
          type="text"
          maxLength={255}
          value={form.address2}
          onChange={(e) => set('address2', e.target.value)}
          placeholder={__('Apartment, suite, etc.')}
          className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {/* City + State row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('City')} *</label>
          <input
            type="text"
            required
            maxLength={100}
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('State / Province')}</label>
          <input
            type="text"
            maxLength={100}
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      {/* Postal code + Country row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Postal Code')} *</label>
          <input
            type="text"
            required
            maxLength={20}
            value={form.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Country')} *</label>
          <select
            required
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="">{__('Select country')}</option>
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {getCountryName(code)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Phone */}
      <div>
        <label className="block text-sm font-medium text-(--text-secondary) mb-1">{__('Phone')}</label>
        <input
          type="tel"
          maxLength={30}
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {/* Default checkbox */}
      <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => set('isDefault', e.target.checked)}
          className="rounded border-(--border-primary)"
        />
        {__('Set as default address')}
      </label>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {__('Save Address')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="py-2 px-4 rounded-lg text-sm font-medium border border-(--border-primary) text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors"
        >
          {__('Cancel')}
        </button>
      </div>
    </form>
  );
}

export default function AccountAddressesPage() {
  const __ = useBlankTranslations();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: addresses, isLoading } = trpc.storeAddresses.list.useQuery();

  const createMutation = trpc.storeAddresses.create.useMutation({
    onSuccess: () => {
      utils.storeAddresses.list.invalidate();
      setShowForm(false);
    },
  });

  const updateMutation = trpc.storeAddresses.update.useMutation({
    onSuccess: () => {
      utils.storeAddresses.list.invalidate();
      setEditingId(null);
    },
  });

  const deleteMutation = trpc.storeAddresses.delete.useMutation({
    onSuccess: () => {
      utils.storeAddresses.list.invalidate();
      setDeletingId(null);
    },
  });

  const setDefaultMutation = trpc.storeAddresses.setDefault.useMutation({
    onSuccess: () => {
      utils.storeAddresses.list.invalidate();
    },
  });

  const handleCreate = (data: AddressFormData) => {
    createMutation.mutate({
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company || undefined,
      address1: data.address1,
      address2: data.address2 || undefined,
      city: data.city,
      state: data.state || undefined,
      postalCode: data.postalCode,
      country: data.country,
      phone: data.phone || undefined,
      isDefault: data.isDefault,
    });
  };

  const handleUpdate = (id: string, data: AddressFormData) => {
    updateMutation.mutate({
      id,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company || undefined,
      address1: data.address1,
      address2: data.address2 || undefined,
      city: data.city,
      state: data.state || undefined,
      postalCode: data.postalCode,
      country: data.country,
      phone: data.phone || undefined,
      isDefault: data.isDefault,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{__('Saved Addresses')}</h1>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {__('Add Address')}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-6">
          <AddressForm
            initial={emptyForm}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {/* Empty state */}
      {!addresses?.length && !showForm && (
        <div className="store-empty">
          <MapPin className="h-12 w-12 store-empty-icon" />
          <p className="store-empty-title">{__('No saved addresses')}</p>
          <p className="store-empty-text">
            {__('Add your first address to speed up checkout.')}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {__('Add your first address')}
          </button>
        </div>
      )}

      {/* Address grid */}
      {addresses && addresses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div key={addr.id}>
              {editingId === addr.id ? (
                <AddressForm
                  initial={{
                    firstName: addr.firstName,
                    lastName: addr.lastName,
                    company: addr.company ?? '',
                    address1: addr.address1,
                    address2: addr.address2 ?? '',
                    city: addr.city,
                    state: addr.state ?? '',
                    postalCode: addr.postalCode,
                    country: addr.country,
                    phone: addr.phone ?? '',
                    isDefault: addr.isDefault ?? false,
                  }}
                  onSubmit={(data) => handleUpdate(addr.id, data)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={updateMutation.isPending}
                />
              ) : (
                <div className="relative rounded-xl bg-(--surface-secondary) border border-(--border-subtle) p-5 hover:border-(--border-primary) transition-colors">
                  {/* Default badge */}
                  {addr.isDefault && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400 px-2.5 py-0.5 text-xs font-medium">
                      <Star className="h-3 w-3" />
                      {__('Default')}
                    </span>
                  )}

                  {/* Address details */}
                  <div className="pr-20 space-y-1">
                    <p className="font-semibold text-(--text-primary)">
                      {addr.firstName} {addr.lastName}
                    </p>
                    {addr.company && (
                      <p className="text-sm text-(--text-secondary)">{addr.company}</p>
                    )}
                    <p className="text-sm text-(--text-secondary)">{addr.address1}</p>
                    {addr.address2 && (
                      <p className="text-sm text-(--text-secondary)">{addr.address2}</p>
                    )}
                    <p className="text-sm text-(--text-secondary)">
                      {addr.city}{addr.state ? `, ${addr.state}` : ''} {addr.postalCode}
                    </p>
                    <p className="text-sm text-(--text-secondary)">{getCountryName(addr.country)}</p>
                    {addr.phone && (
                      <p className="text-sm text-(--text-muted)">{addr.phone}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-(--border-subtle)">
                    <button
                      onClick={() => { setEditingId(addr.id); setShowForm(false); }}
                      className="inline-flex items-center gap-1.5 text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {__('Edit')}
                    </button>

                    {!addr.isDefault && (
                      <button
                        onClick={() => setDefaultMutation.mutate({ id: addr.id })}
                        disabled={setDefaultMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                      >
                        <Star className="h-3.5 w-3.5" />
                        {__('Set as Default')}
                      </button>
                    )}

                    {deletingId === addr.id ? (
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-sm text-red-600 dark:text-red-400">{__('Delete?')}</span>
                        <button
                          onClick={() => deleteMutation.mutate({ id: addr.id })}
                          disabled={deleteMutation.isPending}
                          className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            __('Yes')
                          )}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-sm text-(--text-muted) hover:text-(--text-secondary) transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(addr.id)}
                        className="ml-auto inline-flex items-center gap-1.5 text-sm text-red-600/70 dark:text-red-400/70 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {__('Delete')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
