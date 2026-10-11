/**
 * APIKeysView — API Keys Management UI
 *
 * Lets managers create, view, and revoke API keys for third-party
 * integrations (Xero, Figured, MYOB, irrigation systems).
 *
 * @module components/views/manager/APIKeysView
 */
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiKeysService, type APIKey, type APIScope } from '@/services/api-keys.service';

export default function APIKeysView() {
  const { orchardId } = useAuth();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<APIScope[]>(['harvest:read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState<number | undefined>(90);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadKeys = useCallback(async () => {
    if (!orchardId) return;
    setLoading(true);
    const data = await apiKeysService.listKeys(orchardId);
    setKeys(data);
    setLoading(false);
  }, [orchardId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!orchardId || !newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiKeysService.createKey({
        name: newKeyName.trim(),
        orchardId,
        scopes: newKeyScopes,
        expiresInDays: newKeyExpiry,
      });
      setCreatedKey(result.fullKey);
      setNewKeyName('');
      setShowCreate(false);
      await loadKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key?')) return;
    await apiKeysService.revokeKey(keyId);
    await loadKeys();
  };

  const availableScopes = apiKeysService.getAvailableScopes();

  const toggleScope = (scope: APIScope) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-600">key</span>
          API Keys
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">add</span>
          New Key
        </button>
      </div>

      {/* Created key banner — shown once */}
      {createdKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-sm font-medium text-emerald-700 mb-2">
            ✅ API key created! Copy it now — it won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white px-3 py-2 rounded-lg border font-mono break-all">
              {createdKey}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
              }}
              className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs text-emerald-600 mt-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Key Form */}
      {showCreate && (
        <div className="bg-white rounded-2xl p-5 border border-border-light shadow-sm">
          <h3 className="font-semibold mb-3">Create New API Key</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="e.g. Xero Integration"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Scopes</label>
              <div className="grid grid-cols-2 gap-2">
                {availableScopes.map(s => (
                  <label
                    key={s.scope}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg cursor-pointer border transition-colors ${newKeyScopes.includes(s.scope) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes(s.scope)}
                      onChange={() => toggleScope(s.scope)}
                      className="sr-only"
                    />
                    <span className="material-symbols-outlined text-sm">
                      {newKeyScopes.includes(s.scope) ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Expires In</label>
              <select
                title="API key expiry period"
                value={newKeyExpiry ?? 'never'}
                onChange={e =>
                  setNewKeyExpiry(e.target.value === 'never' ? undefined : Number(e.target.value))
                }
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <span className="material-symbols-outlined text-4xl mb-2 block">key_off</span>
          <p className="text-sm">No API keys yet. Create one to enable integrations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div
              key={key.id}
              className={`bg-white rounded-2xl p-4 border ${key.is_active ? 'border-border-light' : 'border-red-200 opacity-60'} shadow-sm`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-slate-400">key</span>
                  <span className="font-medium text-sm">{key.name}</span>
                  <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {key.key_prefix}...
                  </code>
                </div>
                {key.is_active ? (
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-xs text-red-500 font-medium">Revoked</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {key.scopes.map(scope => (
                  <span
                    key={scope}
                    className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded"
                  >
                    {scope}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span>Created {new Date(key.created_at).toLocaleDateString(undefined, { timeZone: 'Pacific/Auckland' })}</span>
                <span>{key.request_count} requests</span>
                {key.last_used_at && (
                  <span>Last used {new Date(key.last_used_at).toLocaleDateString(undefined, { timeZone: 'Pacific/Auckland' })}</span>
                )}
                {key.expires_at && (
                  <span>Expires {new Date(key.expires_at).toLocaleDateString(undefined, { timeZone: 'Pacific/Auckland' })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
