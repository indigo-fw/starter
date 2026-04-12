'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

// The apiKeys router is registered dynamically by the core-api module.
// Cast to any to avoid TS errors when the module isn't in the generated router type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apiKeysTrpc = trpc as any;

interface ApiKeyManagerProps {
  __: (key: string) => string;
}

export function ApiKeyManager({ __ }: ApiKeyManagerProps) {
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [useSuperkey, setUseSuperkey] = useState(true);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [rolledKey, setRolledKey] = useState<{ key: string; oldExpiresAt: Date } | null>(null);
  const [editingScopesKeyId, setEditingScopesKeyId] = useState<string | null>(null);
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const [editingSuperkey, setEditingSuperkey] = useState(true);

  const utils = apiKeysTrpc.useUtils();
  const { data: keys, isLoading } = apiKeysTrpc.apiKeys.list.useQuery();
  const { data: scopes } = apiKeysTrpc.apiKeys.getScopes.useQuery();

  const createKey = apiKeysTrpc.apiKeys.create.useMutation({
    onSuccess(data: { key: string }) {
      setCreatedKey(data.key);
      setNewKeyName('');
      setSelectedScopes([]);
      setUseSuperkey(true);
      utils.apiKeys.list.invalidate();
    },
  });

  const revokeKey = apiKeysTrpc.apiKeys.revoke.useMutation({
    onSuccess() {
      utils.apiKeys.list.invalidate();
    },
  });

  const rollKey = apiKeysTrpc.apiKeys.roll.useMutation({
    onSuccess(data: { key: string; oldKeyExpiresAt: string }) {
      setRolledKey({ key: data.key, oldExpiresAt: new Date(data.oldKeyExpiresAt) });
      utils.apiKeys.list.invalidate();
    },
  });

  const updateScopes = apiKeysTrpc.apiKeys.updateScopes.useMutation({
    onSuccess() {
      setEditingScopesKeyId(null);
      utils.apiKeys.list.invalidate();
    },
  });

  function handleCreate() {
    createKey.mutate({
      name: newKeyName.trim(),
      scopes: useSuperkey ? null : selectedScopes,
    });
  }

  function toggleScope(scopeId: string) {
    setSelectedScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId],
    );
  }

  function startEditingScopes(keyId: string, currentScopes: string[] | null) {
    setEditingScopesKeyId(keyId);
    setEditingSuperkey(currentScopes === null);
    setEditingScopes(currentScopes ?? []);
  }

  function saveEditingScopes() {
    if (!editingScopesKeyId) return;
    updateScopes.mutate({
      id: editingScopesKeyId,
      scopes: editingSuperkey ? null : editingScopes,
    });
  }

  function toggleEditingScope(scopeId: string) {
    setEditingScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId],
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Create new key ──────────────────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">{__('Create API Key')}</h2>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            className="input flex-1"
            placeholder={__('Key name (e.g. Production, Staging)')}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            maxLength={255}
          />
          <button
            className="btn btn-primary"
            disabled={!newKeyName.trim() || createKey.isPending}
            onClick={handleCreate}
          >
            {createKey.isPending ? __('Creating...') : __('Create Key')}
          </button>
        </div>

        <ScopeSelector
          __={__}
          scopes={scopes ?? []}
          useSuperkey={useSuperkey}
          selectedScopes={selectedScopes}
          onToggleSuperkey={setUseSuperkey}
          onToggleScope={toggleScope}
        />

        {createdKey && (
          <KeyReveal
            __={__}
            label={__('Your API key has been created. Copy it now — it won\'t be shown again.')}
            keyValue={createdKey}
            onDismiss={() => setCreatedKey(null)}
          />
        )}

        {rolledKey && (
          <KeyReveal
            __={__}
            label={__(`New key created. The old key will expire on ${rolledKey.oldExpiresAt.toLocaleString()}.`)}
            keyValue={rolledKey.key}
            onDismiss={() => setRolledKey(null)}
          />
        )}
      </div>

      {/* ─── Keys list ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">{__('API Keys')}</h2>
        </div>

        {isLoading ? (
          <div className="p-6 text-muted">{__('Loading...')}</div>
        ) : !keys?.length ? (
          <div className="p-6 text-muted">{__('No API keys yet.')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">{__('Name')}</th>
                  <th className="table-th">{__('Key')}</th>
                  <th className="table-th">{__('Scopes')}</th>
                  <th className="table-th">{__('Status')}</th>
                  <th className="table-th">{__('Last Used')}</th>
                  <th className="table-th">{__('Created')}</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key: Record<string, unknown> & { id: string; name: string; prefix: string; scopes: string[] | null; status: string; lastUsedAt: string | null; expiresAt: string | Date | null; createdAt: string }) => (
                  <tr key={key.id} className="table-tr">
                    <td className="table-td font-medium">{key.name}</td>
                    <td className="table-td">
                      <code className="text-sm">{key.prefix}...</code>
                    </td>
                    <td className="table-td text-sm">
                      {editingScopesKeyId === key.id ? (
                        <div className="min-w-[280px]">
                          <ScopeSelector
                            __={__}
                            scopes={scopes ?? []}
                            useSuperkey={editingSuperkey}
                            selectedScopes={editingScopes}
                            onToggleSuperkey={setEditingSuperkey}
                            onToggleScope={toggleEditingScope}
                            compact
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={updateScopes.isPending}
                              onClick={saveEditingScopes}
                            >
                              {updateScopes.isPending ? __('Saving...') : __('Save')}
                            </button>
                            <button
                              className="btn btn-sm"
                              onClick={() => setEditingScopesKeyId(null)}
                            >
                              {__('Cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="text-left hover:underline text-muted"
                          disabled={key.status !== 'active'}
                          onClick={() => startEditingScopes(key.id, key.scopes)}
                          title={key.status === 'active' ? __('Click to edit scopes') : undefined}
                        >
                          {key.scopes === null ? (
                            <span className="text-amber-600 dark:text-amber-400">{__('All')}</span>
                          ) : key.scopes.length === 0 ? (
                            <span className="text-red-600">{__('None')}</span>
                          ) : (
                            <span>{key.scopes.length} {__('scopes')}</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="table-td">
                      <StatusBadge __={__} status={key.status} expiresAt={key.expiresAt} />
                    </td>
                    <td className="table-td text-muted text-sm">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : __('Never')}
                    </td>
                    <td className="table-td text-muted text-sm">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </td>
                    <td className="table-td">
                      {(key.status === 'active' || key.status === 'expiring') && (
                        <div className="flex gap-2">
                          {key.status === 'active' && (
                            <button
                              className="btn btn-sm"
                              disabled={rollKey.isPending}
                              onClick={() => {
                                if (confirm(__('Roll this key? A new key will be created and the old one will expire in 24 hours.'))) {
                                  rollKey.mutate({ id: key.id });
                                }
                              }}
                            >
                              {__('Roll')}
                            </button>
                          )}
                          <button
                            className="btn btn-sm text-red-600 hover:text-red-700"
                            disabled={revokeKey.isPending}
                            onClick={() => {
                              if (confirm(__('Revoke this API key? This is immediate and cannot be undone.'))) {
                                revokeKey.mutate({ id: key.id });
                              }
                            }}
                          >
                            {__('Revoke')}
                          </button>
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
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface ScopeSelectorProps {
  __: (s: string) => string;
  scopes: Array<{ id: string; label: string }>;
  useSuperkey: boolean;
  selectedScopes: string[];
  onToggleSuperkey: (v: boolean) => void;
  onToggleScope: (id: string) => void;
  compact?: boolean;
}

function ScopeSelector({ __, scopes, useSuperkey, selectedScopes, onToggleSuperkey, onToggleScope, compact }: ScopeSelectorProps) {
  return (
    <div className={compact ? '' : 'mb-4'}>
      <label className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          checked={useSuperkey}
          onChange={(e) => onToggleSuperkey(e.target.checked)}
          className="rounded"
        />
        <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{__('Full access')}</span>
      </label>

      {!useSuperkey && scopes.length > 0 && (
        <div className={`pl-5 ${compact ? 'space-y-1' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'}`}>
          {scopes.map((scope) => (
            <label key={scope.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedScopes.includes(scope.id)}
                onChange={() => onToggleScope(scope.id)}
                className="rounded"
              />
              <code className="text-xs px-1 py-0.5 bg-muted rounded">{scope.id}</code>
              {!compact && <span className="text-xs text-muted">{scope.label}</span>}
            </label>
          ))}
        </div>
      )}

      {!useSuperkey && selectedScopes.length === 0 && (
        <p className={`text-amber-600 dark:text-amber-400 pl-5 ${compact ? 'text-xs' : 'text-sm'}`}>
          {__('No scopes selected — no access.')}
        </p>
      )}
    </div>
  );
}

function KeyReveal({
  __,
  label,
  keyValue,
  onDismiss,
}: {
  __: (s: string) => string;
  label: string;
  keyValue: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
      <div className="flex justify-between items-start">
        <p className="font-medium text-green-800 dark:text-green-200 mb-2">{label}</p>
        <button className="text-muted hover:text-foreground text-sm" onClick={onDismiss}>
          &times;
        </button>
      </div>
      <code className="block p-3 bg-white dark:bg-black/30 rounded text-sm font-mono break-all select-all">
        {keyValue}
      </code>
      <button
        className="btn btn-secondary mt-2"
        onClick={() => {
          navigator.clipboard.writeText(keyValue);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? __('Copied!') : __('Copy to Clipboard')}
      </button>
    </div>
  );
}

function StatusBadge({ __, status, expiresAt }: { __: (s: string) => string; status: string; expiresAt: string | Date | null }) {
  const isExpiring = status === 'expiring' || (status === 'active' && expiresAt && new Date(expiresAt) > new Date());

  const colorClass = isExpiring
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : status === 'active'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  const label = isExpiring ? __('Expiring') : __(status.charAt(0).toUpperCase() + status.slice(1));

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
