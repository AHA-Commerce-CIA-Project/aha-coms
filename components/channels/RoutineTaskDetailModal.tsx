'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Hand,
  Loader2,
  Lock,
  RotateCcw,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';

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
  claimed_at: string | null;
  completed_at: string | null;
  assignee: AssigneeMini | null;
  checklist_items: ChecklistItem[] | null;
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

              {/* Checklist — same dual-mode rendering as the channel card. */}
              {checklist.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Checklist</h3>
                    <span className="text-[11px] font-medium text-slate-500">
                      {completedCount} / {totalCount} done · {progress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    {checklist.map((it) => {
                      if (type === 'TEAM') {
                        const ownedByMe = it.assignee?.id === currentUserId;
                        const claimed = !!it.assignee;
                        return (
                          <div
                            key={it.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/40"
                          >
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                it.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {it.is_completed && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`flex-1 text-sm ${it.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                              {it.title}
                            </span>
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
                            {!claimed ? (
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
                            ) : null}
                          </div>
                        );
                      }
                      // INDIVIDUAL: only the whole-task assignee can toggle.
                      const canToggle = claimedByMe && !isDone;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          disabled={!canToggle || busy === it.id}
                          onClick={() => toggleItem(it.id, !it.is_completed)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 text-sm transition-colors ${
                            canToggle ? 'hover:bg-slate-50' : ''
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              it.is_completed
                                ? 'bg-indigo-600 border-indigo-600'
                                : canToggle
                                  ? 'border-slate-300'
                                  : 'border-slate-200 bg-slate-50'
                            }`}
                          >
                            {it.is_completed && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`flex-1 text-left ${it.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {it.title}
                          </span>
                          {busy === it.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {isDone && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Completed{snapshot?.completed_at ? ` ${new Date(snapshot.completed_at).toLocaleString()}` : ''}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
