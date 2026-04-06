'use client';

import { useState } from 'react';
import {
  Building2,
  Loader2,
  Plus,
  Trash2,
  LogOut,
  Mail,
  Users,
  X,
  Crown,
  Shield,
  UserIcon,
} from 'lucide-react';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type ViewMode = 'list' | 'detail';

const ROLE_ICONS: Record<string, React.ElementType> = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
};

export default function OrganizationsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const orgsQuery = trpc.organizations.list.useQuery();
  const orgDetailQuery = trpc.organizations.get.useQuery(
    { id: selectedOrgId! },
    { enabled: !!selectedOrgId && viewMode === 'detail' }
  );
  const membersQuery = trpc.organizations.listMembers.useQuery(
    { organizationId: selectedOrgId! },
    { enabled: !!selectedOrgId && viewMode === 'detail' }
  );
  const invitationsQuery = trpc.organizations.listInvitations.useQuery(
    { organizationId: selectedOrgId! },
    { enabled: !!selectedOrgId && viewMode === 'detail' }
  );

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createOrg = trpc.organizations.create.useMutation({
    onSuccess: () => {
      toast.success(__('Organization created'));
      setShowCreateForm(false);
      setNewName('');
      setNewSlug('');
      utils.organizations.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteOrg = trpc.organizations.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Organization deleted'));
      setDeleteTarget(null);
      setViewMode('list');
      setSelectedOrgId(null);
      utils.organizations.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const leaveOrg = trpc.organizations.leave.useMutation({
    onSuccess: () => {
      toast.success(__('Left organization'));
      setLeaveTarget(null);
      setViewMode('list');
      setSelectedOrgId(null);
      utils.organizations.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const inviteMember = trpc.organizations.inviteMember.useMutation({
    onSuccess: () => {
      toast.success(__('Invitation sent'));
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteRole('member');
      utils.organizations.listInvitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.organizations.removeMember.useMutation({
    onSuccess: () => {
      toast.success(__('Member removed'));
      utils.organizations.listMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelInvitation = trpc.organizations.cancelInvitation.useMutation({
    onSuccess: () => {
      toast.success(__('Invitation canceled'));
      utils.organizations.listInvitations.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const acceptInvitation = trpc.organizations.acceptInvitation.useMutation({
    onSuccess: () => {
      toast.success(__('Invitation accepted'));
      utils.organizations.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Accept invitation from URL ──────────────────────────────────────────
  // Check for ?accept=<invitationId> query param
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const acceptId = params.get('accept');
    if (acceptId && !acceptInvitation.isPending && !acceptInvitation.isSuccess) {
      acceptInvitation.mutate({ invitationId: acceptId });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const slug = newSlug.trim() || newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    createOrg.mutate({ name: newName.trim(), slug });
  }

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedOrgId) return;
    inviteMember.mutate({
      organizationId: selectedOrgId,
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  }

  function openDetail(orgId: string) {
    setSelectedOrgId(orgId);
    setViewMode('detail');
  }

  const isOwnerOrAdmin = orgDetailQuery.data?.memberRole === 'owner' || orgDetailQuery.data?.memberRole === 'admin';

  // ─── List View ────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <>
        <header className="dash-header">
          <div className="dash-toolbar">
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Organizations')}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4" />
                {__('Create')}
              </button>
            </div>
          </div>
        </header>
        <main className="dash-main"><div className="dash-inner organizations-page">
        {/* Create form dialog */}
        {showCreateForm && (
          <div className="card mt-4 p-6">
            <h2 className="h2 mb-4">{__('Create Organization')}</h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="label">{__('Name')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input mt-1"
                  placeholder={__('My Organization')}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="label">{__('Slug')}</label>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  className="input mt-1"
                  placeholder={__('my-organization (auto-generated if empty)')}
                  maxLength={100}
                  pattern="^[a-z0-9-]*$"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={createOrg.isPending} className="btn btn-primary disabled:opacity-50">
                  {createOrg.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {__('Create')}
                </button>
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn btn-secondary">
                  {__('Cancel')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Org list */}
        <div className="card mt-4 overflow-hidden">
          {orgsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
            </div>
          ) : !orgsQuery.data?.length ? (
            <div className="empty-state py-12 text-center">
              <Building2 className="mx-auto h-10 w-10 text-(--text-muted)" />
              <p className="mt-3 text-sm text-(--text-muted)">
                {__('No organizations yet. Create one to get started.')}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="thead">
                <tr>
                  <th className="th">{__('Organization')}</th>
                  <th className="th w-28">{__('Role')}</th>
                  <th className="th w-24" />
                </tr>
              </thead>
              <tbody>
                {orgsQuery.data.map((org) => {
                  const RoleIcon = ROLE_ICONS[org.role] ?? UserIcon;
                  return (
                    <tr key={org.orgId} className="tr">
                      <td className="td">
                        <button
                          onClick={() => openDetail(org.orgId)}
                          className="flex items-center gap-3 text-left hover:text-(--color-brand-600)"
                        >
                          {org.orgLogo ? (
                            <Image src={org.orgLogo} alt="" width={32} height={32} className="rounded-full object-cover" unoptimized />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--border-primary) text-xs font-medium text-(--text-secondary)">
                              {(org.orgName ?? '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-(--text-primary)">{org.orgName}</div>
                            <div className="text-xs text-(--text-muted)">{org.orgSlug}</div>
                          </div>
                        </button>
                      </td>
                      <td className="td">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-(--text-secondary)">
                          <RoleIcon className="h-3 w-3" />
                          {org.role}
                        </span>
                      </td>
                      <td className="td text-right">
                        <button
                          onClick={() => openDetail(org.orgId)}
                          className="action-btn text-xs"
                        >
                          {__('Manage')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div></main>
      </>
    );
  }

  // ─── Detail View ──────────────────────────────────────────────────────────
  const orgDetail = orgDetailQuery.data;
  const members = (membersQuery.data as { members?: Array<{ id: string; userId: string; role: string; user?: { name?: string; email?: string; image?: string } }> } | undefined)?.members;
  const invitations = invitationsQuery.data;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setViewMode('list'); setSelectedOrgId(null); }}
              className="text-sm text-(--text-muted) hover:text-(--text-primary)"
            >
              {__('Organizations')}
            </button>
            <span className="text-(--text-muted)">/</span>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {orgDetail?.name ?? <Loader2 className="h-5 w-5 animate-spin inline" />}
            </h1>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner organizations-page">
      {orgDetailQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Members section */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="h2 flex items-center gap-2">
                <Users className="h-5 w-5" />
                {__('Members')}
              </h2>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="btn btn-primary btn-sm"
                >
                  <Mail className="h-4 w-4" />
                  {__('Invite')}
                </button>
              )}
            </div>

            {/* Invite form */}
            {showInviteForm && (
              <form onSubmit={handleInviteSubmit} className="mt-4 flex items-end gap-2 border-t border-(--border-primary) pt-4">
                <div className="flex-1">
                  <label className="label">{__('Email')}</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input mt-1"
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div className="w-32">
                  <label className="label">{__('Role')}</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                    className="select mt-1"
                  >
                    <option value="member">{__('Member')}</option>
                    <option value="admin">{__('Admin')}</option>
                  </select>
                </div>
                <button type="submit" disabled={inviteMember.isPending} className="btn btn-primary disabled:opacity-50">
                  {inviteMember.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {__('Send')}
                </button>
                <button type="button" onClick={() => setShowInviteForm(false)} className="btn btn-secondary">
                  <X className="h-4 w-4" />
                </button>
              </form>
            )}

            {/* Members table */}
            <div className="mt-4">
              {membersQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
                </div>
              ) : (
                <table className="w-full">
                  <thead className="thead">
                    <tr>
                      <th className="th">{__('User')}</th>
                      <th className="th w-24">{__('Role')}</th>
                      {isOwnerOrAdmin && <th className="th w-20" />}
                    </tr>
                  </thead>
                  <tbody>
                    {(members ?? []).map((m) => {
                      const RoleIcon = ROLE_ICONS[m.role] ?? UserIcon;
                      return (
                        <tr key={m.id} className="tr">
                          <td className="td">
                            <div className="flex items-center gap-3">
                              {m.user?.image ? (
                                <Image src={m.user.image} alt="" width={28} height={28} className="rounded-full object-cover" unoptimized />
                              ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-(--border-primary) text-xs font-medium text-(--text-secondary)">
                                  {(m.user?.name ?? '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium text-(--text-primary)">{m.user?.name}</div>
                                <div className="text-xs text-(--text-muted)">{m.user?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="td">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-(--text-secondary)">
                              <RoleIcon className="h-3 w-3" />
                              {m.role}
                            </span>
                          </td>
                          {isOwnerOrAdmin && (
                            <td className="td text-right">
                              {m.role !== 'owner' && (
                                <button
                                  onClick={() => removeMember.mutate({ organizationId: selectedOrgId!, memberId: m.id })}
                                  className="action-btn text-red-600 hover:text-red-700"
                                  title={__('Remove')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Pending Invitations */}
          {isOwnerOrAdmin && invitations && invitations.length > 0 && (
            <div className="card p-6">
              <h2 className="h2 flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {__('Pending Invitations')}
              </h2>
              <div className="mt-4 space-y-2">
                {invitations.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-md border border-(--border-primary) px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-(--text-primary)">{inv.email}</div>
                      <div className="text-xs text-(--text-muted)">
                        {__('Role')}: {inv.role} &middot; {__('Expires')}: {new Date(inv.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => cancelInvitation.mutate({ invitationId: inv.id })}
                      className="btn btn-secondary btn-sm text-red-600"
                      disabled={cancelInvitation.isPending}
                    >
                      <X className="h-3 w-3" />
                      {__('Cancel')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Danger zone */}
          <div className="card p-6">
            <h2 className="h2 text-red-600">{__('Danger Zone')}</h2>
            <div className="mt-4 flex gap-3">
              {orgDetail?.memberRole !== 'owner' && (
                <button
                  onClick={() => setLeaveTarget({ id: selectedOrgId!, name: orgDetail?.name ?? '' })}
                  className="btn btn-danger"
                >
                  <LogOut className="h-4 w-4" />
                  {__('Leave Organization')}
                </button>
              )}
              {orgDetail?.memberRole === 'owner' && (
                <button
                  onClick={() => setDeleteTarget({ id: selectedOrgId!, name: orgDetail?.name ?? '' })}
                  className="btn btn-danger"
                >
                  <Trash2 className="h-4 w-4" />
                  {__('Delete Organization')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete organization?')}
        message={__('Permanently delete "{name}"? This will remove all members and data. This action cannot be undone.', { name: deleteTarget?.name ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteOrg.mutate({ id: deleteTarget.id });
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Leave confirmation */}
      <ConfirmDialog
        open={!!leaveTarget}
        title={__('Leave organization?')}
        message={__('Leave "{name}"? You will lose access to this organization.', { name: leaveTarget?.name ?? '' })}
        confirmLabel={__('Leave')}
        variant="danger"
        onConfirm={() => {
          if (leaveTarget) leaveOrg.mutate({ organizationId: leaveTarget.id });
        }}
        onCancel={() => setLeaveTarget(null)}
      />
    </div></main>
    </>
  );
}
