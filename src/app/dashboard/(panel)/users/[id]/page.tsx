'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
} from 'lucide-react';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ROLES, Role } from '@/core/policy';
import { adminPanel, apiRoutes } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const ROLE_COLORS: Record<string, string> = {
  [Role.USER]: 'bg-(--surface-secondary) text-(--text-secondary)',
  [Role.EDITOR]: 'bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400',
  [Role.ADMIN]: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  [Role.SUPERADMIN]: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  [Role.USER]: Shield,
  [Role.EDITOR]: Shield,
  [Role.ADMIN]: ShieldCheck,
  [Role.SUPERADMIN]: ShieldAlert,
};

export default function UserDetailPage() {
  const __ = useAdminTranslations();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const utils = trpc.useUtils();

  // ─── Queries ────────────────────────────────────────────────────────────────
  const userQuery = trpc.users.get.useQuery({ id: userId });
  const [loginPage, setLoginPage] = useState(1);
  const loginHistory = trpc.users.loginHistory.useQuery({
    userId,
    page: loginPage,
    pageSize: 10,
  });
  const [auditPage, setAuditPage] = useState(1);
  const auditLog = trpc.audit.list.useQuery({
    userId,
    page: auditPage,
    pageSize: 10,
  });

  // ─── Profile editing state ─────────────────────────────────────────────────
  const [editName, setEditName] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string | null>(null);

  const u = userQuery.data;

  // Initialize edit state from loaded data
  const name = editName ?? u?.name ?? '';
  const email = editEmail ?? u?.email ?? '';
  const role = editRole ?? u?.role ?? Role.USER;

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success(__('User updated'));
      utils.users.get.invalidate({ id: userId });
      utils.users.list.invalidate();
      setEditName(null);
      setEditEmail(null);
      setEditRole(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const banUser = trpc.users.ban.useMutation({
    onSuccess: () => {
      toast.success(__('User banned'));
      utils.users.get.invalidate({ id: userId });
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanUser = trpc.users.unban.useMutation({
    onSuccess: () => {
      toast.success(__('User unbanned'));
      utils.users.get.invalidate({ id: userId });
    },
    onError: (err) => toast.error(err.message),
  });

  const gdprAnonymize = trpc.users.gdprAnonymize.useMutation({
    onSuccess: () => {
      toast.success(__('User anonymized'));
      router.push(adminPanel.users);
    },
    onError: (err) => toast.error(err.message),
  });

  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [anonymizeDialogOpen, setAnonymizeDialogOpen] = useState(false);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function formatDate(date: Date | string | null) {
    if (!date) return '\u2014';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function truncate(str: string | null, len: number) {
    if (!str) return '\u2014';
    return str.length > len ? str.slice(0, len) + '\u2026' : str;
  }

  const hasProfileChanges =
    (editName !== null && editName !== u?.name) ||
    (editEmail !== null && editEmail !== u?.email) ||
    (editRole !== null && editRole !== u?.role);

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!hasProfileChanges) return;
    updateUser.mutate({
      id: userId,
      ...(editName !== null && editName !== u?.name ? { name: editName } : {}),
      ...(editEmail !== null && editEmail !== u?.email ? { email: editEmail } : {}),
      ...(editRole !== null && editRole !== u?.role ? { role: editRole as typeof ROLES[number] } : {}),
    });
  }

  // ─── Loading / Not Found ───────────────────────────────────────────────────
  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!u) {
    return (
      <div className="py-20 text-center">
        <p className="text-(--text-muted)">{__('User not found')}</p>
        <button
          onClick={() => router.push(adminPanel.users)}
          className="btn btn-secondary mt-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {__('Back to Users')}
        </button>
      </div>
    );
  }

  const RoleIcon = ROLE_ICONS[u.role] ?? Shield;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(adminPanel.users)}
              className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              {u.image ? (
                <Image src={u.image} alt="" width={40} height={40} className="rounded-full object-cover" unoptimized />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--border-primary) text-sm font-medium text-(--text-secondary)">
                  {(u.name ?? '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-(--text-primary)">{u.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      ROLE_COLORS[u.role] ?? 'bg-(--surface-secondary) text-(--text-secondary)'
                    )}
                  >
                    <RoleIcon className="h-3 w-3" />
                    {u.role}
                  </span>
                  {u.banned && (
                    <span className="inline-block rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                      {__('Banned')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      {/* Profile Card */}
      <form onSubmit={handleSaveProfile} className="card mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="h2">{__('Profile')}</h2>
          <div className="flex items-center gap-2">
            {u.banned ? (
              <button
                type="button"
                onClick={() => unbanUser.mutate({ id: userId })}
                className="btn btn-secondary text-sm"
              >
                <CheckCircle className="h-4 w-4" />
                {__('Unban')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBanDialogOpen(true)}
                className="btn btn-secondary text-sm text-red-600 dark:text-red-400"
              >
                <Ban className="h-4 w-4" />
                {__('Ban')}
              </button>
            )}
            <a
              href={apiRoutes.gdprExport(u.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary text-sm"
              title={__('Export data (GDPR)')}
            >
              <Download className="h-4 w-4" />
              {__('Export')}
            </a>
            <button
              type="button"
              onClick={() => setAnonymizeDialogOpen(true)}
              className="btn btn-secondary text-sm text-red-600 dark:text-red-400"
            >
              <UserX className="h-4 w-4" />
              {__('Anonymize')}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setEditName(e.target.value)}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEditEmail(e.target.value)}
              className="input mt-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Role')}
            </label>
            <select
              value={role}
              onChange={(e) => setEditRole(e.target.value)}
              className="select mt-1 w-full"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Joined')}
            </label>
            <p className="mt-1 px-3 py-2 text-sm text-(--text-muted)">
              {formatDate(u.createdAt)}
            </p>
          </div>
        </div>

        {hasProfileChanges && (
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={updateUser.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {updateUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {__('Save Changes')}
            </button>
          </div>
        )}
      </form>

      {/* Login History */}
      <div className="card mt-6 overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="h2">{__('Login History')}</h2>
        </div>
        {loginHistory.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
          </div>
        ) : (loginHistory.data?.results ?? []).length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-(--text-muted)">
            {__('No login sessions found.')}
          </p>
        ) : (
          <>
            <table className="mt-2 w-full">
              <thead className="table-thead">
                <tr>
                  <th className="table-th w-40">{__('Date')}</th>
                  <th className="table-th w-36">{__('IP Address')}</th>
                  <th className="table-th">{__('User Agent')}</th>
                </tr>
              </thead>
              <tbody>
                {(loginHistory.data?.results ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-(--surface-secondary)">
                    <td className="table-td text-xs text-(--text-muted)">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="table-td text-xs font-mono text-(--text-muted)">
                      {s.ipAddress ?? '\u2014'}
                    </td>
                    <td className="table-td text-xs text-(--text-muted)">
                      {truncate(s.userAgent, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loginHistory.data && loginHistory.data.totalPages > 1 && (
              <div className="flex items-center justify-between p-4">
                <p className="text-xs text-(--text-muted)">
                  {__('Page')} {loginHistory.data.page} {__('of')} {loginHistory.data.totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLoginPage((p) => Math.max(1, p - 1))}
                    disabled={loginPage <= 1}
                    className="btn btn-secondary disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLoginPage((p) => Math.min(loginHistory.data?.totalPages ?? 1, p + 1))}
                    disabled={loginPage >= loginHistory.data.totalPages}
                    className="btn btn-secondary disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Audit Trail */}
      <div className="card mt-6 overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="h2">{__('Audit Trail')}</h2>
        </div>
        {auditLog.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
          </div>
        ) : (auditLog.data?.results ?? []).length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-(--text-muted)">
            {__('No activity recorded for this user.')}
          </p>
        ) : (
          <>
            <table className="mt-2 w-full">
              <thead className="table-thead">
                <tr>
                  <th className="table-th w-40">{__('Time')}</th>
                  <th className="table-th w-24">{__('Action')}</th>
                  <th className="table-th w-24">{__('Type')}</th>
                  <th className="table-th">{__('Entity')}</th>
                </tr>
              </thead>
              <tbody>
                {(auditLog.data?.results ?? []).map((entry) => (
                  <tr key={entry.id} className="hover:bg-(--surface-secondary)">
                    <td className="table-td text-xs text-(--text-muted)">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="table-td">
                      <span className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs font-medium text-(--text-secondary)">
                        {entry.action}
                      </span>
                    </td>
                    <td className="table-td text-xs text-(--text-muted)">{entry.entityType}</td>
                    <td className="table-td text-sm text-(--text-primary)">
                      {entry.entityTitle ?? entry.entityId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditLog.data && auditLog.data.totalPages > 1 && (
              <div className="flex items-center justify-between p-4">
                <p className="text-xs text-(--text-muted)">
                  {__('Page')} {auditLog.data.page} {__('of')} {auditLog.data.totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    className="btn btn-secondary disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setAuditPage((p) => Math.min(auditLog.data?.totalPages ?? 1, p + 1))}
                    disabled={auditPage >= auditLog.data.totalPages}
                    className="btn btn-secondary disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ban Dialog */}
      <ConfirmDialog
        open={banDialogOpen}
        title={__('Ban user?')}
        message={__('Ban {name}? They will lose access.', { name: u.name })}
        confirmLabel={__('Ban')}
        variant="danger"
        onConfirm={() => {
          banUser.mutate({ id: userId });
          setBanDialogOpen(false);
        }}
        onCancel={() => setBanDialogOpen(false)}
      />

      {/* Anonymize Dialog */}
      <ConfirmDialog
        open={anonymizeDialogOpen}
        title={__('Anonymize user? (GDPR)')}
        message={__(
          `Permanently anonymize ${u.name}? This will delete all sessions, credentials, and overwrite personal data. This action cannot be undone.`
        )}
        confirmLabel={__('Anonymize')}
        variant="danger"
        onConfirm={() => {
          gdprAnonymize.mutate({ id: userId });
          setAnonymizeDialogOpen(false);
        }}
        onCancel={() => setAnonymizeDialogOpen(false)}
      />
    </div></main>
    </>
  );
}
