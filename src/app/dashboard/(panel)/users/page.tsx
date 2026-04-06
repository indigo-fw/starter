'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  CheckCircle,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserX,
  X,
} from 'lucide-react';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Role, ROLES } from '@/core/policy';
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

type RoleFilter = 'all' | string;

export default function UsersPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);
  const [editingRole, setEditingRole] = useState<{
    id: string;
    name: string;
    currentRole: string;
  } | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [banTarget, setBanTarget] = useState<{
    id: string;
    name: string;
    banned: boolean;
  } | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const userList = trpc.users.list.useQuery({
    search: search || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    page,
    pageSize: 20,
  });

  const userCounts = trpc.users.counts.useQuery();

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success(__('Role updated'));
      utils.users.list.invalidate();
      utils.users.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const banUser = trpc.users.ban.useMutation({
    onSuccess: () => {
      toast.success(__('User banned'));
      utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const unbanUser = trpc.users.unban.useMutation({
    onSuccess: () => {
      toast.success(__('User unbanned'));
      utils.users.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const gdprAnonymize = trpc.users.gdprAnonymize.useMutation({
    onSuccess: () => {
      toast.success(__('User anonymized'));
      utils.users.list.invalidate();
      utils.users.counts.invalidate();
      setAnonymizeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const data = userList.data;
  const counts = userCounts.data;

  const roleTabs: { key: RoleFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: counts?.all },
    ...ROLES.map((r) => ({
      key: r,
      label: r.charAt(0).toUpperCase() + r.slice(1),
      count: counts?.[r],
    })),
  ];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleRoleChange() {
    if (!editingRole || !selectedRole) return;
    updateRole.mutate({ id: editingRole.id, role: selectedRole as typeof ROLES[number] });
    setEditingRole(null);
  }

  function handleBanToggle() {
    if (!banTarget) return;
    if (banTarget.banned) {
      unbanUser.mutate({ id: banTarget.id });
    } else {
      banUser.mutate({ id: banTarget.id });
    }
    setBanTarget(null);
  }

  function formatDate(date: Date | string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Users')}</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner users-page">
      {/* Role tabs */}
      <div className="mt-4 flex gap-1 border-b border-(--border-primary)">
        {roleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setRoleFilter(t.key);
              setPage(1);
            }}
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
              roleFilter === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
            )}
          >
            {__(t.label)}
            {t.count != null && (
              <span className="ml-1.5 text-xs text-(--text-muted)">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <div className="users-search relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={__('Search by name or email...')}
            className="input pl-9 pr-3"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-secondary)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="submit" className="btn btn-secondary">
          {__('Search')}
        </button>
      </form>

      {/* Table */}
      <div className="card mt-4 overflow-hidden">
        {userList.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('User')}</th>
                <th className="th w-28">{__('Role')}</th>
                <th className="th w-24">{__('Status')}</th>
                <th className="th w-32">{__('Joined')}</th>
                <th className="th w-32" />
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).length === 0 ? (
                <tr>
                  <td className="td py-12 text-center text-(--text-muted)" colSpan={5}>
                    {search ? __('No users found.') : __('No users yet.')}
                  </td>
                </tr>
              ) : (
                (data?.results ?? []).map((u) => {
                  const RoleIcon = ROLE_ICONS[u.role] ?? Shield;
                  return (
                    <tr key={u.id} className="hover:bg-(--surface-secondary)">
                      <td className="td">
                        <div className="users-cell flex items-center gap-3">
                          {u.image ? (
                            <Image
                              src={u.image}
                              alt=""
                              width={32}
                              height={32}
                              className="rounded-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--border-primary) text-xs font-medium text-(--text-secondary)">
                              {(u.name ?? '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="users-info">
                            <Link
                              href={adminPanel.userDetail(u.id)}
                              className="font-medium text-(--text-primary) hover:text-brand-600 hover:underline"
                            >
                              {u.name}
                            </Link>
                            <p className="users-email text-xs text-(--text-muted)">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            ROLE_COLORS[u.role] ?? 'bg-(--surface-secondary) text-(--text-secondary)'
                          )}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {u.role}
                        </span>
                      </td>
                      <td className="td">
                        {u.banned ? (
                          <span className="inline-block rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                            {__('Banned')}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-green-100 dark:bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                            {__('Active')}
                          </span>
                        )}
                      </td>
                      <td className="td text-xs text-(--text-muted)">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="td">
                        <div className="users-row-actions flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingRole({
                                id: u.id,
                                name: u.name ?? u.email,
                                currentRole: u.role,
                              });
                              setSelectedRole(u.role);
                            }}
                            className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                            title={__('Change role')}
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setBanTarget({
                                id: u.id,
                                name: u.name ?? u.email,
                                banned: u.banned,
                              })
                            }
                            className={cn(
                              'rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)',
                              u.banned
                                ? 'hover:text-green-600'
                                : 'hover:text-red-600'
                            )}
                            title={u.banned ? __('Unban') : __('Ban')}
                          >
                            {u.banned ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </button>
                          <a
                            href={apiRoutes.gdprExport(u.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                            title={__('Export data (GDPR)')}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() =>
                              setAnonymizeTarget({
                                id: u.id,
                                name: u.name ?? u.email,
                              })
                            }
                            className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                            title={__('Anonymize (GDPR)')}
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="users-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="users-pagination-buttons flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Role change dialog */}
      {editingRole && (
        <dialog
          open
          className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-lg border border-(--border-primary) bg-(--surface-primary) p-0 shadow-xl backdrop:bg-black/30"
        >
          <div className="users-role-dialog-body p-6">
            <h3 className="text-lg font-semibold text-(--text-primary)">
              {__('Change Role')}
            </h3>
            <p className="mt-2 text-sm text-(--text-secondary)">
              {__('Change role for {name}', { name: editingRole.name })}
            </p>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="select mt-4 w-full"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <div className="users-role-dialog-actions mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingRole(null)}
                className="btn btn-secondary"
              >
                {__('Cancel')}
              </button>
              <button
                onClick={handleRoleChange}
                disabled={selectedRole === editingRole.currentRole}
                className="btn btn-primary disabled:opacity-50"
              >
                {__('Update')}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Ban confirmation */}
      <ConfirmDialog
        open={!!banTarget}
        title={banTarget?.banned ? __('Unban user?') : __('Ban user?')}
        message={
          banTarget?.banned
            ? __('Unban {name}? They will regain access.', { name: banTarget?.name ?? '' })
            : __('Ban {name}? They will lose access.', { name: banTarget?.name ?? '' })
        }
        confirmLabel={banTarget?.banned ? __('Unban') : __('Ban')}
        variant={banTarget?.banned ? 'default' : 'danger'}
        onConfirm={handleBanToggle}
        onCancel={() => setBanTarget(null)}
      />

      {/* GDPR Anonymize confirmation */}
      <ConfirmDialog
        open={!!anonymizeTarget}
        title={__('Anonymize user? (GDPR)')}
        message={__(
          `Permanently anonymize ${anonymizeTarget?.name}? This will delete all sessions, credentials, and overwrite personal data. This action cannot be undone.`
        )}
        confirmLabel={__('Anonymize')}
        variant="danger"
        onConfirm={() => {
          if (anonymizeTarget) gdprAnonymize.mutate({ id: anonymizeTarget.id });
        }}
        onCancel={() => setAnonymizeTarget(null)}
      />
    </div></main>
    </>
  );
}
