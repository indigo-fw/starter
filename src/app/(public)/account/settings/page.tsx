'use client';

import { useState } from 'react';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { apiRoutes } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function AccountSettingsPage() {
  const __ = useBlankTranslations();
  const { data: session } = useSession();
  const [name, setName] = useState(session?.user?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 3000); },
    onError: (err) => setError(err.message),
  });

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      try { await signOut(); } catch { /* sessions already deleted server-side */ }
      window.location.href = '/';
    },
    onError: (err) => {
      setDeleteError(err.message);
      setDeleteDialogOpen(false);
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('Profile Settings')}</h1>

      <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
        <form onSubmit={(e) => { e.preventDefault(); updateProfile.mutate({ name }); }} className="space-y-4 max-w-md">
          {saved && <div className="text-sm text-success-500">{__('Profile updated!')}</div>}
          {error && <div className="text-sm text-danger-500">{error}</div>}

          <div>
            <label className="block text-sm font-medium mb-1">{__('Name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{__('Email')}</label>
            <input
              type="email"
              value={session?.user?.email ?? ''}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-secondary) text-sm opacity-60"
            />
            <p className="text-xs text-(--text-tertiary) mt-1">{__('Email cannot be changed.')}</p>
          </div>

          <button type="submit" disabled={updateProfile.isPending} className="py-2 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50">
            {updateProfile.isPending ? __('Saving...') : __('Save Changes')}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-danger-500/30 p-6">
        <h2 className="font-semibold text-danger-500 mb-2">{__('Danger Zone')}</h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          {__('Download your data or permanently delete your account.')}
        </p>
        {deleteError && <p className="text-sm text-danger-500 mb-3">{deleteError}</p>}
        <div className="flex gap-3">
          <a href={apiRoutes.gdprExport()} className="py-2 px-4 rounded-lg text-sm border border-(--border-primary) hover:bg-(--surface-secondary) transition-colors">
            {__('Download My Data')}
          </a>
          <button
            onClick={() => setDeleteDialogOpen(true)}
            className="py-2 px-4 rounded-lg text-sm border border-danger-500 text-danger-500 hover:bg-danger-500/10 transition-colors"
          >
            {__('Delete Account')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title={__('Delete your account?')}
        message={__('This action is permanent and cannot be undone. Your account and all personal data will be erased. Active subscriptions will be cancelled and will not be refunded. You can register again with the same email address.')}
        confirmLabel={deleteAccount.isPending ? __('Deleting...') : __('Yes, permanently delete my account')}
        cancelLabel={__('Cancel')}
        variant="danger"
        loading={deleteAccount.isPending}
        onConfirm={() => deleteAccount.mutate()}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
}
