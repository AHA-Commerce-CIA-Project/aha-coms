'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ClipboardList,
  Calendar,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';

interface TaskSnapshot {
  id: string;
  task_token: string | null;
  title: string;
  urgency: string | null;
  status: string;
  claimed_at: string | null;
  completed_at: string | null;
  // team_id surfaces the claimer's team so the card can scope the
  // "Open in Team Inbox" link to teammates of the assignee. Null when the
  // claimer has no team set; the gate treats that as "do not show".
  assignee: { id: string; name: string; image: string | null; team_id: string | null } | null;
  requester_name: string | null;
  due_date: string | null;
}

interface DirectAssignCardProps {
  taskId: string;
  previewTitle: string;
  previewBody: string;
  currentUserId: string;
  /** When provided, the card body and a "View details" affordance opens the
   * Team Inbox detail modal instead of navigating away. Channel-page only. */
  onOpenDetail?: (taskId: string) => void;
}

// Priority → header banner colors. Matches the palette used in the task queue chips.
const URGENCY_THEME: Record<
  string,
  { banner: string; pill: string; pillText: string; label: string }
> = {
  'P1':       { banner: 'from-rose-500 to-rose-600',       pill: 'bg-rose-500',    pillText: 'text-white', label: 'P1 · Urgent' },
  'P2':       { banner: 'from-orange-400 to-orange-500',   pill: 'bg-orange-500',  pillText: 'text-white', label: 'P2 · High' },
  'P3':       { banner: 'from-indigo-500 to-purple-500',   pill: 'bg-indigo-500',  pillText: 'text-white', label: 'P3 · Normal' },
  'P4':       { banner: 'from-slate-400 to-slate-500',     pill: 'bg-slate-500',   pillText: 'text-white', label: 'P4 · Low' },
  '5-minute': { banner: 'from-sky-400 to-sky-500',         pill: 'bg-sky-500',     pillText: 'text-white', label: '5-min' },
};

const DEFAULT_THEME = URGENCY_THEME['P3'];

export function DirectAssignCard({ taskId, previewTitle, previewBody, currentUserId, onOpenDetail }: DirectAssignCardProps) {
  const router = useRouter();
  // teamId drives the "Open in Team Inbox" visibility gate below. Read from
  // the auth profile rather than threading another prop through the
  // ChannelMessageItem → DirectAssignCard chain — keeps the prop surface
  // narrow and matches the pattern other auth-aware components in this app
  // use (e.g. /tasks/page.tsx, /users/page.tsx).
  const { profile } = useAuth();
  const currentUserTeamId = profile?.teamId ?? null;
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/fast/api/tasks/${taskId}/card`);
      if (res.ok) setSnapshot(await res.json());
      else if (res.status === 404) setSnapshot(null);
    } catch {
      // Silent — preview-only fallback.
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 15000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`/fast/api/tasks/${taskId}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to claim task');
        return;
      }
      await fetchSnapshot();
    } finally {
      setClaiming(false);
    }
  };

  const urgency = snapshot?.urgency || null;
  const theme = (urgency && URGENCY_THEME[urgency]) || DEFAULT_THEME;
  const status = snapshot?.status;
  const claimedByMe = snapshot?.assignee?.id === currentUserId;
  const isClaimed = !!snapshot?.assignee && status !== 'todo';
  const isDone = status === 'done';
  // Show the "Open in Team Inbox" link only when the viewer shares a team
  // with the claimer. Unclaimed tasks (assignee == null), tasks claimed by
  // someone with no team set, and viewers with no team set all evaluate to
  // false and hide the button. The claimer themselves trivially matches —
  // their own teamId equals their own teamId.
  const canOpenInTeamInbox =
    !!snapshot?.assignee?.team_id &&
    !!currentUserTeamId &&
    snapshot.assignee.team_id === currentUserTeamId;

  const title = snapshot?.title || previewTitle;
  const token = snapshot?.task_token;

  // The card itself is clickable when an onOpenDetail handler is provided —
  // opens the Team Inbox detail modal. Inner buttons (Claim, Open) stop propagation.
  const containerClassName = `mt-1 w-full max-w-[560px] rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow ${
    onOpenDetail ? 'cursor-pointer hover:border-indigo-300' : ''
  }`;
  const handleCardClick = onOpenDetail ? () => onOpenDetail(taskId) : undefined;

  return (
    <div className={containerClassName} onClick={handleCardClick} role={onOpenDetail ? 'button' : undefined}>
      {/* Colored banner — priority-driven */}
      <div className={`relative h-16 bg-gradient-to-br ${theme.banner}`}>
        {/* Decorative swirls */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 30%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.25) 0%, transparent 35%)',
        }} />
        <div className="relative h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <span className="text-[11px] font-bold text-white/95 uppercase tracking-wider">Task Request</span>
          </div>
          <div className="flex items-center gap-2">
            {token && (
              <span className="text-[10px] font-mono text-white/70 bg-black/10 px-1.5 py-0.5 rounded">#{token}</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-3">
        {/* Priority pill + status chip row */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded ${theme.pill} ${theme.pillText}`}>
            {theme.label}
          </span>
          {isDone ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-3 h-3" /> Completed
            </span>
          ) : isClaimed ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-100 text-amber-700">
              In progress
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-indigo-100 text-indigo-700">
              Unclaimed
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-slate-900 text-[17px] leading-snug mb-1.5">
          {title}
        </h3>

        {/* Body preview */}
        {previewBody && (
          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words leading-relaxed mb-3 line-clamp-4">
            {previewBody}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
          {snapshot?.requester_name && (
            <span className="flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-700 font-medium">{snapshot.requester_name}</span>
            </span>
          )}
          {snapshot?.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {new Date(snapshot.due_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: new Date(snapshot.due_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                })}
              </span>
            </span>
          )}
        </div>

        {/* Action area — separator + state-specific row */}
        <div className="border-t border-slate-100 pt-3">
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : !snapshot ? (
            <div className="text-xs text-slate-400 italic">This task is no longer available.</div>
          ) : isDone ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar user={snapshot.assignee} />
                <div className="text-xs">
                  <div className="font-semibold text-slate-800">{snapshot.assignee?.name || 'Unknown'}</div>
                  <div className="text-slate-500">Completed the task</div>
                </div>
              </div>
            </div>
          ) : isClaimed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar user={snapshot.assignee} />
                <div className="text-xs">
                  <div className="font-semibold text-slate-800">
                    {claimedByMe ? 'You' : snapshot.assignee?.name}
                  </div>
                  <div className="text-slate-500">Working on it</div>
                </div>
              </div>
              {canOpenInTeamInbox && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); router.push('/team-inbox'); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  Open in Team Inbox <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Any team member can claim this.</span>
              <div className="flex items-center gap-2">
                {error && <span className="text-[11px] text-rose-600">{error}</span>}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleClaim(); }}
                  disabled={claiming}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {claiming ? 'Claiming…' : 'Claim task'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: { id: string; name: string; image: string | null } | null }) {
  if (!user) return null;
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm">
      {user.image ? (
        <img src={user.image} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
      ) : (
        user.name?.charAt(0)?.toUpperCase() || '?'
      )}
    </div>
  );
}
