'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Plus, Pencil, Trash2, Play, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProvidersPage() {
  const __ = useAdminTranslations();
  const { data: providers, isLoading } = trpc.chatProviders.list.useQuery({});
  const createMutation = trpc.chatProviders.create.useMutation();
  const updateMutation = trpc.chatProviders.update.useMutation();
  const deleteMutation = trpc.chatProviders.delete.useMutation();
  const testMutation = trpc.chatProviders.test.useMutation();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({
    name: '', baseUrl: '', apiKey: '', model: 'gpt-4o-mini',
    priority: 0, status: 'active' as const, maxConcurrent: 10, timeoutSeconds: 60,
  });

  function resetForm() {
    setForm({ name: '', baseUrl: '', apiKey: '', model: 'gpt-4o-mini', priority: 0, status: 'active', maxConcurrent: 10, timeoutSeconds: 60 });
    setEditId(null);
    setShowForm(false);
  }

  function handleEdit(id: string) {
    setEditId(id);
    setShowForm(true);
    // Load provider data
    utils.chatProviders.get.fetch({ id }).then((p) => {
      setForm({
        name: p.name, baseUrl: p.baseUrl ?? '', apiKey: p.apiKey ?? '',
        model: p.model, priority: p.priority, status: p.status as 'active',
        maxConcurrent: p.maxConcurrent, timeoutSeconds: p.timeoutSeconds,
      });
    });
  }

  function handleSave() {
    const onSuccess = () => { resetForm(); utils.chatProviders.list.invalidate(); };
    if (editId) {
      updateMutation.mutate({
        id: editId, name: form.name, baseUrl: form.baseUrl || null,
        apiKey: form.apiKey || undefined, model: form.model, priority: form.priority,
        status: form.status, maxConcurrent: form.maxConcurrent, timeoutSeconds: form.timeoutSeconds,
      }, { onSuccess });
    } else {
      createMutation.mutate({
        name: form.name, baseUrl: form.baseUrl || undefined, apiKey: form.apiKey,
        model: form.model, priority: form.priority, status: form.status,
        maxConcurrent: form.maxConcurrent, timeoutSeconds: form.timeoutSeconds,
      }, { onSuccess });
    }
  }

  function handleDelete(id: string) {
    if (!confirm(__('Delete this provider?'))) return;
    deleteMutation.mutate({ id }, { onSuccess: () => utils.chatProviders.list.invalidate() });
  }

  function handleTest(id: string) {
    setTestResult(null);
    testMutation.mutate({ id }, {
      onSuccess: (r) => setTestResult({ id, success: r.success, msg: r.response }),
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('AI Providers')}</h1>
          <p className="text-sm text-(--text-secondary) mt-1">{__('Manage LLM provider credentials and routing')}</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="btn btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} />{__('Add Provider')}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-(--text-primary)">{editId ? __('Edit Provider') : __('New Provider')}</h2>
            <button onClick={resetForm} className="p-1 text-(--text-tertiary) hover:text-(--text-primary)"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1"><span className="label">{__('Name')}</span>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input w-full" /></label>
            <label className="space-y-1"><span className="label">{__('Model')}</span>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input w-full" /></label>
          </div>
          <label className="block space-y-1"><span className="label">{__('Base URL (leave empty for OpenAI)')}</span>
            <input type="text" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" className="input w-full" /></label>
          <label className="block space-y-1"><span className="label">{__('API Key')}</span>
            <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editId ? __('Leave empty to keep current') : 'sk-...'} className="input w-full font-mono" /></label>
          <div className="grid grid-cols-4 gap-4">
            <label className="space-y-1"><span className="label">{__('Priority')}</span>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="input w-full" /></label>
            <label className="space-y-1"><span className="label">{__('Status')}</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' })} className="select w-full">
                <option value="active">{__('Active')}</option><option value="inactive">{__('Inactive')}</option>
              </select></label>
            <label className="space-y-1"><span className="label">{__('Max Concurrent')}</span>
              <input type="number" value={form.maxConcurrent} onChange={(e) => setForm({ ...form, maxConcurrent: parseInt(e.target.value) || 10 })} className="input w-full" /></label>
            <label className="space-y-1"><span className="label">{__('Timeout (s)')}</span>
              <input type="number" value={form.timeoutSeconds} onChange={(e) => setForm({ ...form, timeoutSeconds: parseInt(e.target.value) || 60 })} className="input w-full" /></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={resetForm} className="btn btn-secondary text-sm">{__('Cancel')}</button>
            <button onClick={handleSave} disabled={isSaving || !form.name || !form.model || (!editId && !form.apiKey)}
              className="btn btn-primary text-sm disabled:opacity-50">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
              {editId ? __('Save') : __('Create')}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>
      ) : !providers?.length ? (
        <div className="card p-8 text-center text-sm text-(--text-tertiary)">
          {__('No providers configured. Add one or set AI_API_KEY in .env for a quick start.')}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border-primary) bg-(--surface-secondary)">
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Name')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Model')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('API Key')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Priority')}</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-secondary)">{__('Status')}</th>
                <th className="px-4 py-3 text-right font-medium text-(--text-secondary)">{__('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-(--border-primary) last:border-0">
                  <td className="px-4 py-3 font-medium text-(--text-primary)">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-(--text-secondary)">{p.model}</td>
                  <td className="px-4 py-3 font-mono text-xs text-(--text-tertiary)">{p.encryptedApiKey}</td>
                  <td className="px-4 py-3 text-(--text-secondary)">{p.priority}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                      p.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-(--surface-secondary) text-(--text-tertiary)'
                    )}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleTest(p.id)} disabled={testMutation.isPending}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-green-500 hover:bg-green-500/10" title={__('Test')}>
                        {testMutation.isPending && testResult === null ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      </button>
                      <button onClick={() => handleEdit(p.id)}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary)"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(p.id)}
                        className="p-1.5 rounded text-(--text-tertiary) hover:text-red-500 hover:bg-red-500/10"><Trash2 size={14} /></button>
                    </div>
                    {testResult?.id === p.id && (
                      <div className={cn('text-xs mt-1', testResult.success ? 'text-green-500' : 'text-red-500')}>
                        {testResult.msg.slice(0, 60)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
