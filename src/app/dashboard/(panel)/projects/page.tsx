'use client';

import { useState } from 'react';
import {
  FolderKanban,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function ProjectsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const projectsQuery = trpc.projects.list.useQuery({ search: search || undefined, page, pageSize: 20 });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success(__('Project created'));
      resetForm();
      utils.projects.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success(__('Project updated'));
      resetForm();
      utils.projects.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Project deleted'));
      setDeleteTarget(null);
      utils.projects.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setShowCreateForm(false);
    setEditingId(null);
    setName('');
    setDescription('');
  }

  function startEdit(project: { id: string; name: string; description: string | null }) {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description ?? '');
    setShowCreateForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      updateProject.mutate({
        id: editingId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } else {
      createProject.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    }
  }

  const isPending = createProject.isPending || updateProject.isPending;
  const data = projectsQuery.data;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Projects')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { resetForm(); setShowCreateForm(true); }}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              {__('New Project')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      {/* Create/Edit form */}
      {showCreateForm && (
        <div className="card mt-4 p-6">
          <h2 className="h2 mb-4">{editingId ? __('Edit Project') : __('New Project')}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{__('Name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input mt-1"
                placeholder={__('Project name')}
                maxLength={255}
                required
              />
            </div>
            <div>
              <label className="label">{__('Description')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="textarea mt-1"
                rows={3}
                placeholder={__('Optional description')}
                maxLength={5000}
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending} className="btn btn-primary disabled:opacity-50">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? __('Save') : __('Create')}
              </button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                {__('Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="mt-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={__('Search projects...')}
          className="search-input"
        />
      </div>

      {/* Projects list */}
      <div className="card mt-4 overflow-hidden">
        {projectsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : !data?.results.length ? (
          <div className="empty-state py-12 text-center">
            <FolderKanban className="mx-auto h-10 w-10 text-(--text-muted)" />
            <p className="mt-3 text-sm text-(--text-muted)">
              {search
                ? __('No projects match your search.')
                : __('No projects yet. Create one to get started.')}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="thead">
                <tr>
                  <th className="th">{__('Name')}</th>
                  <th className="th w-32">{__('Status')}</th>
                  <th className="th w-40">{__('Created')}</th>
                  <th className="th w-28" />
                </tr>
              </thead>
              <tbody>
                {data.results.map((project) => (
                  <tr key={project.id} className="tr">
                    <td className="td">
                      <div>
                        <div className="font-medium text-(--text-primary)">{project.name}</div>
                        {project.description && (
                          <div className="text-xs text-(--text-muted) line-clamp-1">{project.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <span className={`badge ${project.status === 'active' ? 'badge-published' : 'badge-draft'}`}>
                        {project.status}
                      </span>
                    </td>
                    <td className="td text-sm text-(--text-muted)">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1">
                        {project.status === 'active' ? (
                          <button
                            onClick={() => updateProject.mutate({ id: project.id, status: 'archived' })}
                            className="action-btn"
                            title={__('Archive')}
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => updateProject.mutate({ id: project.id, status: 'active' })}
                            className="action-btn"
                            title={__('Restore')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(project)}
                          className="action-btn"
                          title={__('Edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ id: project.id, name: project.name })}
                          className="action-btn text-red-600 hover:text-red-700"
                          title={__('Delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  {__('Previous')}
                </button>
                <span className="text-sm text-(--text-secondary)">
                  {__('Page')} {page} / {data.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  {__('Next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete project?')}
        message={__('Delete "{name}"? This action cannot be undone.', { name: deleteTarget?.name ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteProject.mutate({ id: deleteTarget.id });
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
