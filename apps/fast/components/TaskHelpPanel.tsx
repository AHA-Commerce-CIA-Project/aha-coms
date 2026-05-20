'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, UserMinus, X, Clock, Loader2, Check, History } from 'lucide-react';

interface Collaborator {
    id: string;
    user_id: string;
    name: string;
    image: string | null;
    role: string;
    status: 'pending' | 'approved' | string;
    requested_at: string;
    joined_at: string | null;
}

interface ActivityEntry {
    id: string;
    action: string;
    description: string;
    created_at: string;
    user: { id: string; name: string; image: string | null } | null;
}

// One-line label per action so the timeline isn't a wall of full sentences.
function activityLabel(action: string): { text: string; color: string } {
    switch (action) {
        case 'task_claimed':             return { text: 'claimed the task',           color: 'text-indigo-700' };
        case 'task_assigned':            return { text: 'was assigned the task',      color: 'text-indigo-700' };
        case 'task_help_requested':      return { text: 'requested help',              color: 'text-amber-700 dark:text-amber-400' };
        case 'task_help_request_cancelled': return { text: 'cancelled the help request', color: 'text-slate-500' };
        case 'task_help_requested_to_join': return { text: 'offered to help',          color: 'text-emerald-700' };
        case 'task_help_approved':       return { text: 'approved a helper',            color: 'text-emerald-700' };
        case 'task_help_denied':         return { text: 'declined a help offer',       color: 'text-rose-600' };
        case 'task_help_left':           return { text: 'left the task',               color: 'text-slate-500' };
        case 'task_help_offer_withdrawn':return { text: 'withdrew their help offer',   color: 'text-slate-500' };
        case 'task_completed':           return { text: 'marked the task complete',    color: 'text-emerald-700' };
        default:                         return { text: action,                        color: 'text-slate-500' };
    }
}

function formatActivityTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today · ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

interface Props {
    taskId: string;
    /** ID of the task assignee — used to decide if the current user is the owner. */
    assigneeId: string | null | undefined;
    /** Current user id. If undefined, the panel renders as read-only (no actions). */
    currentUserId: string | undefined;
    /** Current needs_help state. The panel calls onTaskUpdated() after toggling so the parent can refetch. */
    needsHelp: boolean;
    /** Parent-provided callback to refresh the task row after the flag toggles or helpers change. */
    onTaskUpdated: () => void;
    /** Optional — hide the panel entirely for completed tasks. */
    hidden?: boolean;
}

// Shared collaboration panel used by the /tasks and /nexus task-detail modals.
// - Owner: "Request Help" / "Cancel request" + "Pending requests" approve/deny list
// - Non-owner on a flagged task: "Request to help" → "Waiting · Cancel" → "Leave" (after approval)
// - Approved helpers shown as chips regardless of role.
export function TaskHelpPanel({ taskId, assigneeId, currentUserId, needsHelp, onTaskUpdated, hidden }: Props) {
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showActivity, setShowActivity] = useState(false);

    const fetchCollaborators = useCallback(async () => {
        try {
            const res = await fetch(`/fast/api/tasks/${taskId}/collaborators`);
            if (res.ok) setCollaborators(await res.json());
        } catch {}
    }, [taskId]);

    const fetchActivity = useCallback(async () => {
        try {
            const res = await fetch(`/fast/api/tasks/${taskId}/activity`);
            if (res.ok) setActivity(await res.json());
        } catch {}
    }, [taskId]);

    useEffect(() => {
        fetchCollaborators();
        fetchActivity();
    }, [taskId, fetchCollaborators, fetchActivity]);

    if (hidden) return null;

    const isOwner = !!currentUserId && assigneeId === currentUserId;
    const myRow = currentUserId ? collaborators.find(c => c.user_id === currentUserId) : null;
    const myStatus = myRow?.status as 'pending' | 'approved' | undefined;
    const approvedHelpers = collaborators.filter(c => c.status === 'approved');
    const pendingRequests = collaborators.filter(c => c.status === 'pending');

    // Hide entirely for non-owners on tasks that haven't requested help and where they aren't already involved.
    if (!isOwner && !needsHelp && !myRow) return null;

    const runAction = async (fn: () => Promise<Response>) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fn();
            if (res.ok) {
                await Promise.all([fetchCollaborators(), fetchActivity()]);
                onTaskUpdated();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data?.error || `Request failed (HTTP ${res.status}).`);
            }
        } catch {
            setError('Network error. Please try again.');
        }
        setLoading(false);
    };

    const toggleHelpRequest = () => runAction(() =>
        fetch(`/fast/api/tasks/${taskId}/request-help`, { method: needsHelp ? 'DELETE' : 'POST' }),
    );
    const requestToHelp = () => runAction(() => fetch(`/fast/api/tasks/${taskId}/collaborators`, { method: 'POST' }));
    const leave = () => runAction(() => fetch(`/fast/api/tasks/${taskId}/collaborators`, { method: 'DELETE' }));
    const decide = (collabId: string, action: 'approve' | 'deny') => runAction(() =>
        fetch(`/fast/api/tasks/${taskId}/collaborators/${collabId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        }),
    );

    return (
        <div className={`rounded-xl border p-4 space-y-3 ${needsHelp ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                    <Users className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                            {needsHelp ? 'Help requested 🙋' : myStatus === 'approved' ? 'You are a helper' : 'Collaboration'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {myStatus === 'approved'
                                ? 'You were approved to help on this task. Only the assignee can request more help.'
                                : myStatus === 'pending'
                                    ? 'Your offer is waiting for the assignee to approve.'
                                    : needsHelp
                                        ? isOwner
                                            ? 'Teammates can now offer to help. You approve who joins.'
                                            : 'The assignee is asking for help — offer to join.'
                                        : isOwner
                                            ? 'You can ask teammates to help when this task is too big to handle alone.'
                                            : 'Only the assignee can request help for this task.'}
                        </p>
                    </div>
                </div>
                {/* Action button — priority order:
                    1) If the current user is already a collaborator (pending/approved), they can only Leave/Cancel.
                       NEVER show any "Request Help" button to a collaborator, even if needs_help flips off.
                    2) Otherwise, the primary assignee sees Request Help / Cancel request.
                    3) Otherwise, a non-involved teammate on a flagged task sees Request to help. */}
                {myStatus === 'pending' ? (
                    <button
                        onClick={leave}
                        disabled={loading}
                        className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                        Waiting · Cancel
                    </button>
                ) : myStatus === 'approved' ? (
                    <button
                        onClick={leave}
                        disabled={loading}
                        className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                        Leave
                    </button>
                ) : isOwner ? (
                    <button
                        onClick={toggleHelpRequest}
                        disabled={loading}
                        className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 ${
                            needsHelp
                                ? 'bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : needsHelp ? <X className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                        {needsHelp ? 'Cancel request' : 'Request Help'}
                    </button>
                ) : needsHelp && currentUserId ? (
                    <button
                        onClick={requestToHelp}
                        disabled={loading}
                        className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Offer To Help
                    </button>
                ) : null}
            </div>

            {isOwner && pendingRequests.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                        Pending requests ({pendingRequests.length})
                    </p>
                    {pendingRequests.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                {c.image ? (
                                    <img src={c.image} alt={c.name} className="w-6 h-6 rounded-full object-cover" />
                                ) : (
                                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[11px] font-bold flex items-center justify-center">
                                        {c.name.charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <span className="text-sm text-slate-700 truncate">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => decide(c.id, 'approve')}
                                    disabled={loading}
                                    title="Approve"
                                    className="p-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => decide(c.id, 'deny')}
                                    disabled={loading}
                                    title="Deny"
                                    className="p-1.5 bg-white border border-rose-300 text-rose-600 rounded-md hover:bg-rose-50 disabled:opacity-50 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {approvedHelpers.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Helpers ({approvedHelpers.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {approvedHelpers.map(c => (
                            <div key={c.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 bg-white border border-slate-200 rounded-full">
                                {c.image ? (
                                    <img src={c.image} alt={c.name} className="w-5 h-5 rounded-full object-cover" />
                                ) : (
                                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                                        {c.name.charAt(0).toUpperCase()}
                                    </span>
                                )}
                                <span className="text-xs text-slate-700">{c.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Activity timeline — collapsible so it doesn't dominate the panel on quiet tasks. */}
            {activity.length > 0 && (
                <div className="pt-2 border-t border-slate-200">
                    <button
                        onClick={() => setShowActivity(v => !v)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-700 uppercase tracking-wider"
                    >
                        <History className="w-3 h-3" />
                        Activity ({activity.length})
                        <span className="text-slate-400">{showActivity ? '▾' : '▸'}</span>
                    </button>
                    {showActivity && (
                        <ol className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                            {activity.map(a => {
                                const label = activityLabel(a.action);
                                return (
                                    <li key={a.id} className="flex items-center gap-2 text-xs">
                                        {a.user?.image ? (
                                            <img src={a.user.image} alt={a.user.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                                        ) : (
                                            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                {(a.user?.name || '?').charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                        <span className="text-slate-700 truncate">
                                            <span className="font-medium">{a.user?.name || 'Someone'}</span>
                                            {' '}
                                            <span className={label.color}>{label.text}</span>
                                        </span>
                                        <span className="ml-auto text-[10px] text-slate-400 whitespace-nowrap">{formatActivityTime(a.created_at)}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>
            )}

            {error && <p className="text-[11px] text-rose-600">{error}</p>}
        </div>
    );
}
