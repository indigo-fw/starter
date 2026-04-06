'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { formatRelativeTime } from '@/core/lib/datetime';
import { useBlankTranslations } from '@/lib/translations';

export default function AccountSecurityPage() {
  const __ = useBlankTranslations();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setSuccess(__('Password changed successfully'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => setError(err.message),
  });

  const { data: sessions, refetch } = trpc.auth.activeSessions.useQuery();
  const revokeSession = trpc.auth.revokeSession.useMutation({ onSuccess: () => refetch() });
  const revokeAll = trpc.auth.revokeAllSessions.useMutation({ onSuccess: () => refetch() });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) { setError(__('Passwords do not match')); return; }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('Security')}</h1>

      <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
        <h2 className="font-semibold mb-4">{__('Change Password')}</h2>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          {success && <div className="text-sm text-success-500">{success}</div>}
          {error && <div className="text-sm text-danger-500">{error}</div>}

          <div>
            <label className="block text-sm font-medium mb-1">{__('Current Password')}</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{__('New Password')}</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm" minLength={6} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{__('Confirm New Password')}</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm" minLength={6} required />
          </div>

          <button type="submit" disabled={changePassword.isPending} className="py-2 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50">
            {changePassword.isPending ? __('Changing...') : __('Change Password')}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-(--border-primary) p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{__('Active Sessions')}</h2>
          <button onClick={() => revokeAll.mutate()} className="text-xs text-danger-500 hover:underline">
            {__('Revoke all other sessions')}
          </button>
        </div>
        <div className="space-y-3">
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-(--border-primary) last:border-0">
              <div>
                <p className="text-sm">{s.userAgent?.slice(0, 50) ?? __('Unknown device')}</p>
                <p className="text-xs text-(--text-tertiary)">
                  {s.ipAddress ?? __('Unknown IP')} · {formatRelativeTime(s.createdAt)}
                </p>
              </div>
              <button onClick={() => revokeSession.mutate({ sessionId: s.id })} className="text-xs text-danger-500 hover:underline">
                {__('Revoke')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
