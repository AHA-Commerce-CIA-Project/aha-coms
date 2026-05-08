'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, UserPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  teamName?: string | null;
}

interface AddChannelMembersModalProps {
  open: boolean;
  channelId: string | null;
  channelName: string;
  // Already-visible users in the channel (won't be shown in the picker).
  existingMemberIds: string[];
  onClose: () => void;
  onAdded?: (count: number) => void;
}

export function AddChannelMembersModal({
  open,
  channelId,
  channelName,
  existingMemberIds,
  onClose,
  onAdded,
}: AddChannelMembersModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setSearch('');
    setError(null);
    fetch('/api/chat/users')
      .then(r => r.ok ? r.json() : [])
      .then((list: User[]) => setUsers(list))
      .catch(() => setUsers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  const existingSet = useMemo(() => new Set(existingMemberIds), [existingMemberIds]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (existingSet.has(u.id)) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, search, existingSet]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!channelId || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to add members');
        return;
      }
      onAdded?.(data.added ?? selected.size);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !channelId) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Add people to #{channelName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pick teammates from any team — they'll get access to this channel.</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[200px]">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">
              {search ? 'No matching users' : 'Everyone already has access.'}
            </div>
          ) : (
            filtered.map((u) => {
              const isSelected = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                    isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                    {u.image ? (
                      <img src={u.image} alt={u.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      u.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{u.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                  </div>
                  <div
                    className={cn(
                      'w-5 h-5 rounded-md flex items-center justify-center border transition-colors flex-shrink-0',
                      isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300',
                    )}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="px-5 pt-2 text-xs text-rose-600">{error}</div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-2xl">
          <span className="text-xs text-slate-500">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={submitting || selected.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {submitting ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
