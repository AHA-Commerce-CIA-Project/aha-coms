'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Hand,
  Loader2,
  RotateCcw,
  User as UserIcon,
  Users,
  Lock,
} from 'lucide-react';

interface AssigneeMini {
  id: string;
  name: string;
  image: string | null;
}

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
  claimed_at: string | null;
  completed_at: string | null;
  assignee: AssigneeMini | null;
  checklist_items: ChecklistItem[] | null;
}

interface RoutineTaskCardProps {
  taskId: string;
  /** Title/description prefilled from the message body for instant render. */
  previewTitle: string;
  previewBody: string;
  currentUserId: string;
}

export function RoutineTaskCard({ taskId, previewTitle, previewBody, currentUserId }: RoutineTaskCardProps) {
  const [snapshot, setSnapshot] = useState<RoutineSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/card`);
      if (res.ok) setSnapshot(await res.json());
    } catch {
      // preview-only fallback
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Lightweight polling — same cadence as DirectAssignCard so multi-tab state
  // converges within a tab or two of someone clicking Claim.
  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 15000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const claimTask = async () => {
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

  const title = snapshot?.title || previewTitle;
  const description = snapshot?.description || previewBody || null;
  const type = snapshot?.type ?? 'INDIVIDUAL';
  const isDone = snapshot?.status === 'done';
  const checklist = snapshot?.checklist_items ?? [];
  const claimedByMe = snapshot?.assignee?.id === currentUserId;
  const isClaimed = !!snapshot?.assignee;

  const completedCount = checklist.filter((i) => i.is_completed).length;
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="mt-1 max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-100 flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
          {description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">{description}</p>
          )}
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0 ${
            type === 'TEAM' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
          }`}
        >
          {type === 'TEAM' ? <Users className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
          {type === 'TEAM' ? 'Team' : 'Individual'}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {error && (
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{error}</div>
        )}

        {/* INDIVIDUAL: whole-task claim, locked checklist for non-assignees. */}
        {type === 'INDIVIDUAL' && (
          <>
            {!isClaimed ? (
              <button
                type="button"
                onClick={claimTask}
                disabled={!!busy || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {busy === 'task' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hand className="w-4 h-4" />}
                Claim Task
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                {snapshot?.assignee?.image ? (
                  <img src={snapshot.assignee.image} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
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
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : !claimedByMe ? (
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                ) : null}
              </div>
            )}

            {checklist.length > 0 && (
              <div className="space-y-1">
                {checklist.map((it) => {
                  const canToggle = claimedByMe && !isDone;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      disabled={!canToggle || busy === it.id}
                      onClick={() => toggleItem(it.id, !it.is_completed)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
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
                      <span
                        className={`flex-1 text-left ${
                          it.is_completed ? 'line-through text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {it.title}
                      </span>
                      {busy === it.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TEAM: no whole-task claim. Each item has its own Claim / Done button. */}
        {type === 'TEAM' && (
          <>
            {totalCount > 0 && (
              <div>
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                  <span>{completedCount} / {totalCount} done</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {checklist.map((it) => {
                const ownedByMe = it.assignee?.id === currentUserId;
                const claimed = !!it.assignee;
                return (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 bg-slate-50/40"
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        it.is_completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {it.is_completed && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span
                      className={`flex-1 text-sm truncate ${
                        it.is_completed ? 'line-through text-slate-400' : 'text-slate-700'
                      }`}
                    >
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
                        <span className="text-[11px] text-slate-600 font-medium truncate max-w-[80px]">
                          {ownedByMe ? 'You' : it.assignee.name.split(' ')[0]}
                        </span>
                      </div>
                    ) : null}

                    {/* Action buttons */}
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
              })}
            </div>

            {isDone && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-medium">All items completed.</span>
                {snapshot?.completed_at && (
                  <span className="text-emerald-600">{new Date(snapshot.completed_at).toLocaleString()}</span>
                )}
              </div>
            )}
          </>
        )}

        {loading && !snapshot && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
