'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Hand,
  Loader2,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { isHtml, sanitizeRichText } from '@/lib/sanitize';

// Reuses the same shape /api/tasks/[id]/card returns. Kept in this file so
// the detail modal stays self-contained and doesn't drag in DOM types from
// the channel card.
interface AssigneeMini { id: string; name: string; image: string | null }
interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  position: number;
  assignee: AssigneeMini | null;
  claimed_at: string | null;
}
interface RoutineSnapshot {
  id: string;
  title: string;
  description: string | null;
  status: string;
  type: 'INDIVIDUAL' | 'TEAM' | null;
  reference_urls: string[];
  channel_id: string | null;
  channel_message_id: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  assignee: AssigneeMini | null;
  checklist_items: ChecklistItem[] | null;
}

interface ThreadReply {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; image: string | null };
}

interface RoutineTaskDetailModalProps {
  open: boolean;
  taskId: string | null;
  currentUserId: string;
  onClose: () => void;
}

export function RoutineTaskDetailModal({ open, taskId, currentUserId, onClose }: RoutineTaskDetailModalProps) {
  const [snapshot, setSnapshot] = useState<RoutineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dynamic checklist UX state.
  // `newItemTitle` powers the "Add item" row; in-flight adds clear it.
  // `editingId` tracks which item is currently in inline-edit mode and
  // `editingTitle` is the working draft for that row (committed on Enter
  // / blur / Save).
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Comment thread state — comments here ARE the thread replies on the
  // bot's parent ChannelMessage. Fetched + posted via the existing
  // /api/channels/[channelId]/[messageId]/replies endpoint so the in-feed
  // thread view and the in-modal comments stay in sync automatically.
  const [replies, setReplies] = useState<ThreadReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [draftReply, setDraftReply] = useState('');
  const [postingReply, setPostingReply] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/card`);
      if (res.ok) setSnapshot(await res.json());
    } catch {
      // preview-only fallback handled by parent
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Reset state every time we open with a (potentially different) task so
  // the modal never flashes stale data from a previous click.
  useEffect(() => {
    if (!open || !taskId) {
      setSnapshot(null);
      setLoading(true);
      setError(null);
      return;
    }
    setSnapshot(null);
    setLoading(true);
    setError(null);
    fetchSnapshot();
    // Keep polling while open so claims by other members reflect quickly.
    const interval = setInterval(fetchSnapshot, 8000);
    return () => clearInterval(interval);
  }, [open, taskId, fetchSnapshot]);

  // Escape closes — same pattern as the routine template modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const claimTask = async () => {
    if (!taskId) return;
    setBusy('task');
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || 'Failed to claim task');
      await fetchSnapshot();
    } finally {
      setBusy(null);
    }
  };

  const claimItem = async (itemId: string) => {
    if (!taskId) return;
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist/${itemId}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || 'Failed to claim item');
      await fetchSnapshot();
    } finally {
      setBusy(null);
    }
  };

  const toggleItem = async (itemId: string, next: boolean) => {
    if (!taskId) return;
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || 'Failed to update item');
      await fetchSnapshot();
    } finally {
      setBusy(null);
    }
  };

  // Dynamic-checklist mutations. Each one round-trips through the existing
  // /api/tasks/[id]/checklist endpoints; the API enforces the real
  // permission rules — these client paths just gate the affordance.
  const addItem = async () => {
    if (!taskId) return;
    const title = newItemTitle.trim();
    if (!title) return;
    setBusy('add-item');
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to add item');
      } else {
        setNewItemTitle('');
        await fetchSnapshot();
      }
    } finally {
      setBusy(null);
    }
  };

  const renameItem = async (itemId: string) => {
    if (!taskId) return;
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to rename item');
      } else {
        setEditingId(null);
        await fetchSnapshot();
      }
    } finally {
      setBusy(null);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!taskId) return;
    if (!confirm('Remove this item?')) return;
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to delete item');
      } else {
        await fetchSnapshot();
      }
    } finally {
      setBusy(null);
    }
  };

  // Thread replies — fetch + post against the bot's parent ChannelMessage.
  // The endpoint is the same one the in-feed thread view uses, so a reply
  // posted here shows up there immediately and vice versa.
  const channelId = snapshot?.channel_id || null;
  const channelMessageId = snapshot?.channel_message_id || null;

  const fetchReplies = useCallback(async () => {
    if (!channelId || !channelMessageId) {
      setReplies([]);
      return;
    }
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/${channelMessageId}/replies`);
      if (res.ok) {
        const data = await res.json();
        setReplies(Array.isArray(data) ? data : []);
      }
    } catch {
      // Best-effort — leave the existing list in place on transient errors.
    } finally {
      setRepliesLoading(false);
    }
  }, [channelId, channelMessageId]);

  useEffect(() => {
    if (!open || !channelId || !channelMessageId) return;
    fetchReplies();
    // Light polling so a reply posted from the in-feed thread appears here
    // without forcing a manual refresh. Same cadence as the snapshot poll.
    const interval = setInterval(fetchReplies, 8000);
    return () => clearInterval(interval);
  }, [open, channelId, channelMessageId, fetchReplies]);

  const postReply = async () => {
    if (!channelId || !channelMessageId) return;
    const content = draftReply.trim();
    if (!content) return;
    setPostingReply(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/${channelMessageId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments: [], mentions: [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to post reply');
      } else {
        setDraftReply('');
        await fetchReplies();
      }
    } finally {
      setPostingReply(false);
    }
  };

  if (!open || !taskId) return null;

  const type = snapshot?.type ?? 'INDIVIDUAL';
  const isDone = snapshot?.status === 'done';
  const checklist = snapshot?.checklist_items ?? [];
  const claimedByMe = snapshot?.assignee?.id === currentUserId;
  const isClaimed = !!snapshot?.assignee;
  const completedCount = checklist.filter((i) => i.is_completed).length;
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-200 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <RotateCcw className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-800 truncate">{snapshot?.title || 'Routine task'}</h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 ${
                  type === 'TEAM' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {type === 'TEAM' ? <Users className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                {type === 'TEAM' ? 'Team' : 'Individual'}
              </span>
              {isDone && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Routine reminder · spawned by AHABOT</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white/60 rounded-lg transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[calc(100vh-220px)] overflow-y-auto space-y-5">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <>
              {error && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{error}</div>
              )}

              {/* Full description — no line-clamp here, modal is the place to read it. */}
              {snapshot?.description && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description</h3>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{snapshot.description}</p>
                </section>
              )}

              {/* All reference links — full URL shown, not just the host. */}
              {snapshot?.reference_urls && snapshot.reference_urls.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Reference Links ({snapshot.reference_urls.length})
                  </h3>
                  <div className="space-y-1.5">
                    {snapshot.reference_urls.map((url, idx) => {
                      const host = (() => {
                        try { return new URL(url).hostname.replace(/^www\./, ''); }
                        catch { return ''; }
                      })();
                      return (
                        <a
                          key={`${url}-${idx}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors group"
                        >
                          <ExternalLink className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate group-hover:text-indigo-700">{host || 'Open link'}</p>
                            <p className="text-[11px] text-slate-400 truncate">{url}</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Claim block — INDIVIDUAL whole-task; TEAM is per-item below. */}
              {type === 'INDIVIDUAL' && (
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Owner</h3>
                  {!isClaimed ? (
                    <button
                      type="button"
                      onClick={claimTask}
                      disabled={!!busy || isDone}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {busy === 'task' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />}
                      Claim Task
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                      {snapshot?.assignee?.image ? (
                        <img src={snapshot.assignee.image} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                          {snapshot?.assignee?.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-semibold text-slate-700 truncate">
                          {claimedByMe ? 'Claimed by you' : `Claimed by ${snapshot?.assignee?.name}`}
                        </p>
                        {snapshot?.claimed_at && (
                          <p className="text-[11px] text-slate-400">{new Date(snapshot.claimed_at).toLocaleString()}</p>
                        )}
                      </div>
                      {!claimedByMe && !isDone && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </div>
                  )}
                </section>
              )}

              {/* Checklist — dynamic mode. Anyone in the channel can add items;
                  individual items are editable/deletable when unclaimed OR by
                  the claimer. Completion toggle still requires ownership. */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Checklist</h3>
                  {totalCount > 0 && (
                    <span className="text-[11px] font-medium text-slate-500">
                      {completedCount} / {totalCount} done · {progress}%
                    </span>
                  )}
                </div>
                {totalCount > 0 && (
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  {checklist.map((it) => {
                    const ownedByMe = it.assignee?.id === currentUserId;
                    const claimed = !!it.assignee;
                    // Strict-ownership gate — matches the server rule.
                    //   TEAM       → caller must BE the item's claimer.
                    //                Unclaimed items get no edit/delete UI;
                    //                user is forced to click Claim first.
                    //   INDIVIDUAL → caller must own the whole task (or the
                    //                task isn't claimed yet, since INDIVIDUAL
                    //                items have no per-item assignee).
                    const canMutate = type === 'TEAM'
                      ? ownedByMe
                      : (!isClaimed || claimedByMe);
                    const isEditing = editingId === it.id;

                    if (type === 'TEAM') {
                      return (
                        <div
                          key={it.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/40 group"
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              it.is_completed
                                ? 'bg-emerald-500 border-emerald-500'
                                : claimed
                                  ? 'border-slate-300 bg-white'
                                  : 'border-dashed border-slate-300 bg-slate-100 opacity-50'
                            }`}
                          >
                            {it.is_completed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => renameItem(it.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); renameItem(it.id); }
                                if (e.key === 'Escape') { setEditingId(null); }
                              }}
                              className="flex-1 bg-white border border-indigo-300 rounded px-2 py-0.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          ) : (
                            <span
                              className={`flex-1 text-sm truncate ${
                                it.is_completed ? 'line-through text-slate-400' : claimed ? 'text-slate-700' : 'text-slate-500'
                              }`}
                            >
                              {it.title}
                            </span>
                          )}
                          {claimed && it.assignee ? (
                            <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white border border-slate-200">
                              {it.assignee.image ? (
                                <img src={it.assignee.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold">
                                  {it.assignee.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-[11px] text-slate-600 font-medium truncate max-w-[100px]">
                                {ownedByMe ? 'You' : it.assignee.name.split(' ')[0]}
                              </span>
                            </div>
                          ) : null}
                          {!isEditing && canMutate && !it.is_completed && (
                            <button
                              type="button"
                              onClick={() => { setEditingId(it.id); setEditingTitle(it.title); }}
                              className="p-1 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isEditing && canMutate && (
                            <button
                              type="button"
                              onClick={() => deleteItem(it.id)}
                              disabled={busy === it.id}
                              className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isEditing && (
                            !claimed ? (
                              <button
                                type="button"
                                onClick={() => claimItem(it.id)}
                                disabled={busy === it.id || isDone}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                              >
                                {busy === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hand className="w-3 h-3" />}
                                Claim
                              </button>
                            ) : ownedByMe && !it.is_completed ? (
                              <button
                                type="button"
                                onClick={() => toggleItem(it.id, true)}
                                disabled={busy === it.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                              >
                                {busy === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Done
                              </button>
                            ) : ownedByMe && it.is_completed ? (
                              <button
                                type="button"
                                onClick={() => toggleItem(it.id, false)}
                                disabled={busy === it.id}
                                className="text-[11px] font-medium text-slate-400 hover:text-slate-600 px-1.5 py-1"
                              >
                                Undo
                              </button>
                            ) : null
                          )}
                        </div>
                      );
                    }
                    // INDIVIDUAL — only the whole-task assignee can toggle / edit / delete.
                    const canToggle = claimedByMe && !isDone;
                    return (
                      <div
                        key={it.id}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 group"
                      >
                        <button
                          type="button"
                          disabled={!canToggle || busy === it.id || isEditing}
                          onClick={() => toggleItem(it.id, !it.is_completed)}
                          className="flex-shrink-0"
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              it.is_completed
                                ? 'bg-indigo-600 border-indigo-600'
                                : canToggle
                                  ? 'border-slate-300 hover:border-indigo-400'
                                  : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            {it.is_completed && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => renameItem(it.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); renameItem(it.id); }
                              if (e.key === 'Escape') { setEditingId(null); }
                            }}
                            className="flex-1 bg-white border border-indigo-300 rounded px-2 py-0.5 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className={`flex-1 text-left text-sm ${it.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {it.title}
                          </span>
                        )}
                        {!isEditing && canMutate && !it.is_completed && (
                          <button
                            type="button"
                            onClick={() => { setEditingId(it.id); setEditingTitle(it.title); }}
                            className="p-1 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit item"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isEditing && canMutate && (
                          <button
                            type="button"
                            onClick={() => deleteItem(it.id)}
                            disabled={busy === it.id}
                            className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {busy === it.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      </div>
                    );
                  })}

                  {/* Add row — open to everyone (server is the access boundary). */}
                  {!isDone && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 bg-white">
                      <Plus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); addItem(); }
                        }}
                        placeholder="Add an item…"
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addItem}
                        disabled={!newItemTitle.trim() || busy === 'add-item'}
                        className="text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent px-2 py-1 rounded-md transition-colors"
                      >
                        {busy === 'add-item' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {isDone && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Completed{snapshot?.completed_at ? ` ${new Date(snapshot.completed_at).toLocaleString()}` : ''}</span>
                </div>
              )}

              {/* Comments — bi-directional with the bot message's thread replies.
                  Posting here calls the same endpoint as posting in the channel
                  thread view, so the two surfaces stay in sync. */}
              {channelId && channelMessageId && (
                <section>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Comments
                    </h3>
                    {repliesLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                    <span className="text-[11px] text-slate-400">
                      {replies.length === 0 ? 'No comments yet.' : `${replies.length}`}
                    </span>
                  </div>

                  {replies.length > 0 && (
                    <div className="space-y-2 mb-3 max-h-[260px] overflow-y-auto">
                      {replies.map((r) => (
                        <div key={r.id} className="flex items-start gap-2">
                          {r.sender.image ? (
                            <img src={r.sender.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                              {r.sender.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-slate-800">{r.sender.name}</span>
                              <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
                            </div>
                            {isHtml(r.content) ? (
                              // Comments arrive from the same composer as the
                              // channel thread, so they can include mention
                              // chips and other rich-text HTML. Sanitize and
                              // render so chips/formatting appear styled
                              // instead of as raw <span> source.
                              <div
                                className="text-sm text-slate-700 break-words leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:font-mono"
                                dangerouslySetInnerHTML={{ __html: sanitizeRichText(r.content) }}
                              />
                            ) : (
                              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                                {r.content}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-300/40 transition-colors">
                    <textarea
                      value={draftReply}
                      onChange={(e) => setDraftReply(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter sends, Shift+Enter inserts a newline — matches
                        // the chat composer's mental model.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          postReply();
                        }
                      }}
                      placeholder="Comment on this routine… (Enter to send)"
                      rows={1}
                      className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none resize-none max-h-32"
                    />
                    <button
                      type="button"
                      onClick={postReply}
                      disabled={!draftReply.trim() || postingReply}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-semibold transition-colors disabled:opacity-40"
                    >
                      {postingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Comments sync with the bot message&apos;s thread in the channel.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
