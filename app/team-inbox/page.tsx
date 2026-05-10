'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Paperclip, AlertTriangle, Hash, Clock, CheckCircle2, Circle, Hand, Check, RotateCcw, Loader2, MoreVertical, UserPlus, Bookmark, Forward, Archive, ArchiveRestore, PauseCircle, PlayCircle, X, ListChecks } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { htmlToPlainText } from '@/lib/sanitize';
import { PageTabs } from '@/components/PageTabs';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';

interface Attachment {
    url: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
}

interface InboxTask {
    id: string;
    title: string;
    description: string | null;
    urgency: string | null;
    status: string;
    attachments: Attachment[];
    dueDate: string | null;
    createdAt: string;
    claimedAt: string | null;
    completedAt: string | null;
    overdueAcknowledgedAt: string | null;
    requesterName: string | null;
    requesterEmail: string | null;
    requesterDivision: string | null;
    targetChannel: { id: string; name: string } | null;
    channelMessageId: string | null;
    assignee: { id: string; name: string; image: string | null } | null;
    assignedTeam: { id: string; name: string } | null;
    taskToken: string | null;
    archivedByMe?: boolean;
    pendingReason?: string | null;
    pendingTag?: string | null;
    pendedAt?: string | null;
    pendedFromStatus?: string | null;
    needsHelp?: boolean;
    checklist?: { total: number; completed: number };
}

const PENDING_TAGS: { value: string; label: string }[] = [
    { value: 'waiting_on_brand', label: 'Waiting on brand' },
    { value: 'waiting_on_partner', label: 'Waiting on partner' },
    { value: 'waiting_on_internal', label: 'Waiting on internal team' },
    { value: 'waiting_on_user', label: 'Waiting on requester' },
    { value: 'other', label: 'Other' },
];
const PENDING_TAG_LABEL: Record<string, string> = Object.fromEntries(
    PENDING_TAGS.map(t => [t.value, t.label]),
);

interface Team {
    id: string;
    name: string;
}

interface PickerMember {
    id: string;
    name: string;
    image: string | null;
}

interface ForwardPayload {
    originalAuthor: string;
    originalAuthorImage?: string | null;
    originalContent: string;
    originalAttachments: any[];
    isTaskForward: boolean;
    taskToken?: string;
    taskId?: string;
}

const PRIORITY_TONE: Record<string, { bg: string; text: string; border: string }> = {
    P1: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    P2: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    P3: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    P4: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    '5-minute': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
};

const STATUS_TONE: Record<string, { label: string; bg: string; text: string }> = {
    todo: { label: 'New', bg: 'bg-sky-50', text: 'text-sky-700' },
    'in-progress': { label: 'In Progress', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    review: { label: 'In Review', bg: 'bg-violet-50', text: 'text-violet-700' },
    pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700' },
    pending_completion_details: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700' },
    done: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function formatClaimedAt(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return `today at ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

function formatRelative(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}

function deadlineState(dueIso: string | null): { label: string; tone: 'ok' | 'soon' | 'overdue' } | null {
    if (!dueIso) return null;
    const due = new Date(dueIso).getTime();
    const now = Date.now();
    const diffMs = due - now;
    const dayMs = 86400000;
    if (diffMs < 0) {
        const days = Math.ceil(Math.abs(diffMs) / dayMs);
        return { label: `${days}d overdue`, tone: 'overdue' };
    }
    const days = Math.ceil(diffMs / dayMs);
    if (days <= 1) return { label: 'Due today', tone: 'soon' };
    if (days <= 3) return { label: `Due in ${days}d`, tone: 'soon' };
    return { label: `Due in ${days}d`, tone: 'ok' };
}

export default function TeamInboxPage() {
    const { profile, isLeader } = useAuth();
    const router = useRouter();
    const isMaster = profile?.role === 'admin';

    const [tasks, setTasks] = useState<InboxTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Per-card pending state — disables card actions while a quick-action is in flight.
    const [pendingId, setPendingId] = useState<string | null>(null);
    // Drag-and-drop state.
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    // Toast for non-blocking action errors (e.g. "Only the assignee can complete").
    const [actionError, setActionError] = useState<string | null>(null);
    // 3-dot kebab menu state — id of the card whose menu is open, plus the
    // submenu (assign-picker) state. Only one menu is open at a time.
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [assignPickerForId, setAssignPickerForId] = useState<string | null>(null);
    const [pickerMembers, setPickerMembers] = useState<PickerMember[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    // Forward-to-channel modal payload. Mirrors the pattern in /nexus.
    const [forwardData, setForwardData] = useState<ForwardPayload | null>(null);
    // Show archived tasks toggle — defaults to off so the Completed column
    // stays uncluttered. Persisted in URL params via the API.
    const [showArchived, setShowArchived] = useState(false);
    // Mark-as-Pending modal — opened from the 3-dot menu. Free-text reason
    // plus a structured tag so reporting can group blockers later.
    const [pendingModalTask, setPendingModalTask] = useState<InboxTask | null>(null);
    const [pendingModalReason, setPendingModalReason] = useState('');
    const [pendingModalTag, setPendingModalTag] = useState<string>('waiting_on_brand');
    const [pendingModalSubmitting, setPendingModalSubmitting] = useState(false);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const openTaskInChannel = (t: InboxTask) => {
        // Behave like clicking a saved item in /later: jump to the channel and
        // scroll/highlight the source message (the direct-assign card). The
        // detail modal opens only when the user actively clicks the card —
        // never auto-opens from this navigation. Direct-assign channels live on
        // the "Assign Task" purpose tab — pass it so the page lands on the
        // right tab instead of defaulting to "Channels".
        const base = '/messages?purpose=assign_task';
        if (t.targetChannel?.id && t.channelMessageId) {
            router.push(`${base}&channel=${t.targetChannel.id}&highlight=${t.channelMessageId}`);
        } else if (t.targetChannel?.id) {
            router.push(`${base}&channel=${t.targetChannel.id}`);
        } else {
            router.push(base);
        }
    };

    const fetchInbox = useCallback(async (teamId?: string | null, withArchived?: boolean) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (teamId) params.set('teamId', teamId);
            if (withArchived ?? showArchived) params.set('showArchived', '1');
            const qs = params.toString();
            const url = qs ? `/api/team-inbox?${qs}` : '/api/team-inbox';
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to load');
            setTasks(data.tasks || []);
            if (!selectedTeamId && data.teamId) setSelectedTeamId(data.teamId);
        } catch (err: any) {
            setError(err?.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [selectedTeamId, showArchived]);

    useEffect(() => { fetchInbox(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-dismiss the action error toast after 4s so it doesn't stick around.
    useEffect(() => {
        if (!actionError) return;
        const timer = setTimeout(() => setActionError(null), 4000);
        return () => clearTimeout(timer);
    }, [actionError]);

    // Quick-action helpers. All do an optimistic local update, then refetch
    // on success and roll back on failure (snapshotting the previous list).
    const myId = profile?.id;

    const runQuickAction = async (
        task: InboxTask,
        url: string,
        applyOptimistic: (t: InboxTask) => InboxTask,
        errorPrefix: string,
    ) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        const snapshot = tasks;
        // Optimistic update so the card visibly moves while the request flies.
        setTasks((prev) => prev.map((t) => (t.id === task.id ? applyOptimistic(t) : t)));
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || `${errorPrefix} (${res.status})`);
            }
            // Refetch so we get authoritative state (assignee object, claimedAt, etc).
            await fetchInbox(selectedTeamId);
        } catch (err: any) {
            setActionError(err?.message || errorPrefix);
            setTasks(snapshot); // rollback
        } finally {
            setPendingId(null);
        }
    };

    const handleClaim = (task: InboxTask) =>
        runQuickAction(
            task,
            `/api/tasks/${task.id}/claim`,
            (t) => ({
                ...t,
                status: 'in-progress',
                claimedAt: new Date().toISOString(),
                assignee: myId ? { id: myId, name: profile?.name || 'You', image: profile?.image || null } : t.assignee,
            }),
            'Failed to claim task',
        );

    const handleComplete = (task: InboxTask) =>
        runQuickAction(
            task,
            `/api/tasks/${task.id}/quick-complete`,
            (t) => ({ ...t, status: 'done', completedAt: new Date().toISOString() }),
            'Failed to mark complete',
        );

    const handleReopen = (task: InboxTask) =>
        runQuickAction(
            task,
            `/api/tasks/${task.id}/reopen`,
            (t) => ({ ...t, status: 'in-progress', completedAt: null }),
            'Failed to reopen task',
        );

    const handleAcknowledgeOverdue = (task: InboxTask) =>
        runQuickAction(
            task,
            `/api/tasks/${task.id}/acknowledge-overdue`,
            (t) => ({ ...t, overdueAcknowledgedAt: new Date().toISOString() }),
            'Failed to update task',
        );

    // Open the Mark-as-Pending modal. Reason is required so the requester
    // gets meaningful context in the notification ("waiting on brand price
    // update" beats a silent status flip).
    const openPendingModal = (task: InboxTask) => {
        setPendingModalTask(task);
        setPendingModalReason('');
        setPendingModalTag('waiting_on_brand');
        setMenuOpenId(null);
    };

    const submitPending = async () => {
        if (!pendingModalTask || !pendingModalReason.trim() || pendingModalSubmitting) return;
        setPendingModalSubmitting(true);
        setActionError(null);
        try {
            const res = await fetch(`/api/tasks/${pendingModalTask.id}/pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: pendingModalReason.trim(),
                    tag: pendingModalTag,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to mark task pending');
            }
            setPendingModalTask(null);
            setPendingModalReason('');
            await fetchInbox(selectedTeamId);
        } catch (err: any) {
            setActionError(err?.message || 'Failed to mark task pending');
        } finally {
            setPendingModalSubmitting(false);
        }
    };

    const handleResume = async (task: InboxTask) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        const snapshot = tasks;
        // Optimistic: flip status back to whatever it was before the pause.
        setTasks((prev) => prev.map((t) => (t.id === task.id ? {
            ...t,
            status: t.pendedFromStatus || 'in-progress',
            pendingReason: null,
            pendingTag: null,
            pendedAt: null,
            pendedFromStatus: null,
        } : t)));
        try {
            const res = await fetch(`/api/tasks/${task.id}/pending`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to resume task');
            }
            await fetchInbox(selectedTeamId);
        } catch (err: any) {
            setActionError(err?.message || 'Failed to resume task');
            setTasks(snapshot);
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
        }
    };

    // Personal-archive a task — hides it from this user's Completed column.
    // Per-user record, so leaders can clean up their own view without
    // affecting anyone else.
    const handleArchive = async (task: InboxTask) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        const snapshot = tasks;
        // Optimistic: drop the task from the visible list when not showing archived.
        if (!showArchived) {
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
        } else {
            setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, archivedByMe: true } : t)));
        }
        try {
            const res = await fetch(`/api/tasks/${task.id}/personal-archive`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to archive task');
            }
        } catch (err: any) {
            setActionError(err?.message || 'Failed to archive task');
            setTasks(snapshot);
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
        }
    };

    const handleUnarchive = async (task: InboxTask) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        const snapshot = tasks;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, archivedByMe: false } : t)));
        try {
            const res = await fetch(`/api/tasks/${task.id}/personal-archive`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to restore task');
            }
        } catch (err: any) {
            setActionError(err?.message || 'Failed to restore task');
            setTasks(snapshot);
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
        }
    };

    // Toggle Save for Later — wired to the existing /api/tasks/[id]/save endpoint
    // (same one /later page uses). We don't track saved state in the inbox
    // payload, so just fire-and-forget with a toast on failure.
    const handleToggleSave = async (task: InboxTask) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/tasks/${task.id}/save`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to save');
            }
            const data = await res.json().catch(() => ({}));
            setActionError(data.action === 'saved' ? 'Saved for later.' : 'Removed from Saved.');
        } catch (err: any) {
            setActionError(err?.message || 'Failed to save');
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
        }
    };

    // Request Help / Cancel — toggles task.needsHelp via the existing
    // /api/tasks/:id/request-help endpoint (POST to flag, DELETE to clear).
    // Optimistic update so the "Help wanted" badge swaps instantly; we
    // revert if the server rejects (e.g. only the assignee is allowed).
    const handleToggleHelp = async (task: InboxTask) => {
        if (pendingId) return;
        const next = !task.needsHelp;
        const snapshot = tasks;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, needsHelp: next } : t)));
        setPendingId(task.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/tasks/${task.id}/request-help`, {
                method: next ? 'POST' : 'DELETE',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to update help request');
            }
        } catch (err: any) {
            setTasks(snapshot);
            setActionError(err?.message || 'Failed to update help request');
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
        }
    };

    // Reassign — calls the existing claim endpoint with reassignTo body.
    // Authorization is enforced server-side: leaders/admins can reassign any
    // task; members can only reassign tasks currently assigned to them.
    const handleReassign = async (task: InboxTask, userId: string) => {
        if (pendingId) return;
        setPendingId(task.id);
        setActionError(null);
        const snapshot = tasks;
        setTasks((prev) => prev.map((t) => (t.id === task.id ? {
            ...t,
            status: 'in-progress',
            claimedAt: new Date().toISOString(),
            assignee: { id: userId, name: pickerMembers.find(m => m.id === userId)?.name || '...', image: pickerMembers.find(m => m.id === userId)?.image || null },
        } : t)));
        try {
            const res = await fetch(`/api/tasks/${task.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reassignTo: userId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Failed to reassign task');
            }
            await fetchInbox(selectedTeamId);
        } catch (err: any) {
            setActionError(err?.message || 'Failed to reassign task');
            setTasks(snapshot);
        } finally {
            setPendingId(null);
            setMenuOpenId(null);
            setAssignPickerForId(null);
        }
    };

    // Lazy-load assignable members the first time a picker opens. Uses
    // /api/chat/users which is open to any authenticated user (so members can
    // reassign their own tasks too — auth on the action itself is enforced
    // server-side in /api/tasks/[id]/claim).
    const ensurePickerMembers = useCallback(async () => {
        if (pickerMembers.length > 0 || pickerLoading) return;
        setPickerLoading(true);
        try {
            const res = await fetch('/api/chat/users');
            const data = await res.json().catch(() => null);
            if (Array.isArray(data)) {
                setPickerMembers(data.map((u: any) => ({ id: u.id, name: u.name, image: u.image || null })));
            }
        } catch {
            // best-effort
        } finally {
            setPickerLoading(false);
        }
    }, [pickerMembers.length, pickerLoading]);

    // Build the forward payload from a task — content includes title + token +
    // requester + priority + description, mirroring the pattern in /nexus.
    const openForward = (t: InboxTask) => {
        setForwardData({
            originalAuthor: t.requesterName || 'Requester',
            originalContent: `📋 Task: ${t.title}\nToken: ${t.taskToken || '—'}\nRequester: ${t.requesterName || '—'} (${t.requesterDivision || '—'})\nPriority: ${t.urgency || 'P3'} | Status: ${t.status}${t.description ? '\n\n' + htmlToPlainText(t.description) : ''}`,
            originalAttachments: [],
            isTaskForward: true,
            taskToken: t.taskToken || undefined,
            taskId: t.id,
        });
        setMenuOpenId(null);
    };

    // Close menus on outside click / Esc.
    useEffect(() => {
        if (!menuOpenId) return;
        const onDown = (e: MouseEvent) => {
            const card = cardRefs.current[menuOpenId];
            if (card && !card.contains(e.target as Node)) {
                setMenuOpenId(null);
                setAssignPickerForId(null);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setMenuOpenId(null);
                setAssignPickerForId(null);
            }
        };
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [menuOpenId]);

    // Drag-and-drop dispatcher. Valid transitions:
    //   unclaimed  → inProgress (= claim, anyone)
    //   inProgress → completed  (= mark complete, assignee only)
    //   completed  → inProgress (= reopen, assignee only)
    //   overdue    → inProgress (= acknowledge overdue, assignee only — task
    //                            is still in-progress with a past due date;
    //                            this just dismisses the danger flag)
    //   overdue    → completed  (= mark complete, assignee only)
    // Dropping ONTO Overdue is a no-op — Overdue is derived from dueDate.
    const handleDrop = (task: InboxTask, targetCol: 'unclaimed' | 'inProgress' | 'completed' | 'overdue') => {
        if (targetCol === 'overdue') return;
        if (targetCol === 'unclaimed') return; // can't un-claim by dragging

        const dueMs = task.dueDate ? new Date(task.dueDate).getTime() : null;
        const ackMs = task.overdueAcknowledgedAt ? new Date(task.overdueAcknowledgedAt).getTime() : null;
        const acknowledged = ackMs !== null && (dueMs === null || ackMs >= dueMs);
        const isOverdueCard = !!dueMs && task.status !== 'done' && dueMs < Date.now() && !acknowledged;

        // Unclaimed → In Progress = claim
        if (task.status === 'todo' && !task.assignee && targetCol === 'inProgress') {
            handleClaim(task);
            return;
        }

        // Anything → Completed (only assignee)
        if (task.status !== 'done' && targetCol === 'completed') {
            if (task.assignee?.id !== myId) {
                setActionError('Only the assignee can mark this task complete.');
                return;
            }
            handleComplete(task);
            return;
        }

        // Completed → In Progress = reopen (assignee only)
        if (task.status === 'done' && targetCol === 'inProgress') {
            if (task.assignee?.id !== myId) {
                setActionError('Only the assignee can reopen this task.');
                return;
            }
            handleReopen(task);
            return;
        }

        // Overdue → In Progress = dismiss the overdue flag (assignee only).
        // Task stays in-progress with its past due date; the kanban just
        // stops filing it under Overdue going forward.
        if (isOverdueCard && targetCol === 'inProgress' && task.status !== 'done') {
            if (task.assignee?.id !== myId) {
                setActionError('Only the assignee can move this task out of Overdue.');
                return;
            }
            handleAcknowledgeOverdue(task);
            return;
        }
        // Any other drop is a no-op.
    };

    // Drag is gated to the task owner. Cards are draggable when the task is
    // unclaimed (anyone may claim) or the current user is the assignee.
    // Other people's claimed tasks are not draggable so users don't try to
    // advance work that isn't theirs. Pending tasks are NOT draggable —
    // they have to be resumed first via the 3-dot menu so the audit trail
    // is preserved (otherwise a stray drag could silently un-pause work
    // that's still legitimately blocked).
    const canDrag = (task: InboxTask): boolean => {
        if (task.status === 'pending') return false;
        if (!task.assignee) return true;
        return task.assignee.id === myId;
    };

    // Master can switch teams
    useEffect(() => {
        if (!isMaster) return;
        fetch('/api/teams').then(r => r.ok ? r.json() : []).then(setTeams).catch(() => setTeams([]));
    }, [isMaster]);

    return (
        <div className="space-y-5">
            <PageTabs tabs={[
                { href: '/tasks', label: 'My Tasks' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Cards Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ]} />
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-indigo-600" />
                    <h1 className="text-xl font-bold text-slate-800">Cards Inbox</h1>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-2.5 py-2 rounded-lg cursor-pointer hover:border-slate-300">
                        <input
                            type="checkbox"
                            checked={showArchived}
                            onChange={(e) => {
                                const v = e.target.checked;
                                setShowArchived(v);
                                fetchInbox(selectedTeamId, v);
                            }}
                            className="w-3.5 h-3.5 accent-indigo-600"
                        />
                        Show archived
                    </label>
                    {isMaster && teams.length > 0 && (
                        <select
                            value={selectedTeamId || ''}
                            onChange={(e) => { setSelectedTeamId(e.target.value); fetchInbox(e.target.value); }}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="">My team</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <p className="text-sm text-slate-500">
                Tasks posted into this team&apos;s Assign Task channels. Click a card to open the task and claim it.
            </p>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {!loading && error && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            {!loading && !error && (() => {
                // Bucket tasks into 4 mutually-exclusive columns. Overdue takes
                // precedence over the regular status — a P1 that's past its
                // due date lands in the Overdue column, not "In Progress",
                // so it stops getting overlooked. Pending tasks are EXEMPT
                // from Overdue — the assignee shouldn't be flagged for a
                // task that's blocked on someone else.
                const now = Date.now();
                const buckets = { unclaimed: [] as InboxTask[], inProgress: [] as InboxTask[], overdue: [] as InboxTask[], completed: [] as InboxTask[] };
                let pendingCount = 0;
                for (const t of tasks) {
                    const isDone = t.status === 'done';
                    const isPending = t.status === 'pending';
                    if (isPending) pendingCount += 1;
                    const dueMs = t.dueDate ? new Date(t.dueDate).getTime() : null;
                    const ackMs = t.overdueAcknowledgedAt ? new Date(t.overdueAcknowledgedAt).getTime() : null;
                    // Acknowledgement is valid as long as the task hasn't slipped further
                    // (dueDate hasn't been pushed back even more after the ack). Once the
                    // assignee acknowledges, the card moves to In Progress and stays there.
                    const acknowledged = ackMs !== null && (dueMs === null || ackMs >= dueMs);
                    const isOverdue = !isPending && !!dueMs && !isDone && dueMs < now && !acknowledged;
                    if (isDone) buckets.completed.push(t);
                    else if (isOverdue) buckets.overdue.push(t);
                    else if (isPending) buckets.inProgress.push(t);
                    else if (t.status === 'todo' && !t.assignee) buckets.unclaimed.push(t);
                    else buckets.inProgress.push(t);
                }
                const total = tasks.length;

                if (total === 0) {
                    return (
                        <div className="rounded-2xl bg-white border border-slate-200 px-6 py-12 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                                <Inbox className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 className="text-base font-bold text-slate-700 mb-1">Inbox is empty</h3>
                            <p className="text-sm text-slate-400">Direct-assigned tasks for your team will appear here as cards.</p>
                        </div>
                    );
                }

                // Column order: workflow left-to-right (Unclaimed → In Progress → Completed),
                // with Overdue parked at the far right as a flagging bucket. Overdue is a
                // derived view (a task is *also* in-progress under the hood), so it never
                // accepts drops — only the three workflow columns do.
                const columns: { key: keyof typeof buckets; label: string; icon: typeof Inbox; iconClass: string; headerClass: string; ringClass: string }[] = [
                    { key: 'unclaimed',  label: 'Unclaimed',   icon: Circle,        iconClass: 'text-sky-500',     headerClass: 'bg-sky-50 border-sky-200',         ringClass: 'hover:border-sky-300' },
                    { key: 'inProgress', label: 'In Progress', icon: Clock,         iconClass: 'text-indigo-500',  headerClass: 'bg-indigo-50 border-indigo-200',   ringClass: 'hover:border-indigo-300' },
                    { key: 'completed',  label: 'Completed',   icon: CheckCircle2,  iconClass: 'text-emerald-500', headerClass: 'bg-emerald-50 border-emerald-200', ringClass: 'hover:border-emerald-300' },
                    { key: 'overdue',    label: 'Overdue',     icon: AlertTriangle, iconClass: 'text-rose-500',    headerClass: 'bg-rose-50 border-rose-200',       ringClass: 'hover:border-rose-300' },
                ];

                return (
                    <>
                        {/* Stats strip — visual summary: Total + 4 buckets + Pending. */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="rounded-2xl bg-white border border-slate-200 p-4">
                                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Total</div>
                                <div className="text-2xl font-bold text-slate-900">{total}</div>
                            </div>
                            {columns.map(c => (
                                <div key={c.key} className={`rounded-2xl bg-white border border-slate-200 p-4`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <c.icon className={`w-3.5 h-3.5 ${c.iconClass}`} />
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{c.label}</span>
                                    </div>
                                    <div className={`text-2xl font-bold ${c.iconClass}`}>{buckets[c.key].length}</div>
                                </div>
                            ))}
                            <div className="rounded-2xl bg-white border border-amber-200 p-4">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pending</span>
                                </div>
                                <div className="text-2xl font-bold text-amber-500">{pendingCount}</div>
                            </div>
                        </div>

                        {/* Action error toast — non-blocking, auto-dismisses after 4s. */}
                        {actionError && (
                            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {actionError}
                            </div>
                        )}

                        {/* Kanban — 4 columns, responsive (1 col mobile / 2 col tablet / 4 col desktop).
                            Drag a card from one column header onto another to advance status:
                              Unclaimed → In Progress (= claim, anyone)
                              In Progress → Completed (assignee only)
                              Completed → In Progress (assignee only, undo)
                            Overdue stays a derived bucket — drops onto it are no-ops. */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
                            {columns.map(col => {
                                const isDropTarget = col.key !== 'overdue';
                                const isDragOverThis = dragOverColumn === col.key && isDropTarget;
                                return (
                                <section
                                    key={col.key}
                                    className={`rounded-2xl bg-slate-50 border ${isDragOverThis ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'} overflow-hidden transition-colors`}
                                    onDragOver={(e) => {
                                        if (!isDropTarget || !draggingId) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        setDragOverColumn(col.key);
                                    }}
                                    onDragLeave={() => {
                                        if (dragOverColumn === col.key) setDragOverColumn(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setDragOverColumn(null);
                                        if (!draggingId) return;
                                        const draggedTask = tasks.find((t) => t.id === draggingId);
                                        setDraggingId(null);
                                        if (draggedTask) handleDrop(draggedTask, col.key);
                                    }}
                                >
                                    <header className={`px-4 py-2.5 border-b ${col.headerClass} flex items-center justify-between gap-2`}>
                                        <div className="flex items-center gap-1.5">
                                            <col.icon className={`w-4 h-4 ${col.iconClass}`} />
                                            <h3 className="text-sm font-bold text-slate-800">{col.label}</h3>
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                                            {buckets[col.key].length}
                                        </span>
                                    </header>
                                    <div className="p-2.5 space-y-2 max-h-[calc(100vh-300px)] min-h-[200px] overflow-y-auto">
                                        {buckets[col.key].length === 0 ? (
                                            <div className="text-xs text-slate-400 italic text-center py-6">No tasks</div>
                                        ) : (
                                            buckets[col.key].map(t => {
                                                const tone = (t.urgency && PRIORITY_TONE[t.urgency]) || PRIORITY_TONE.P3;
                                                const isPaused = t.status === 'pending';
                                                // Hide the deadline pill on Completed cards — a completed
                                                // task that ran past its due date should NOT read as "6d
                                                // overdue", that makes it look unfinished. Same goes for
                                                // pending cards: the "overdue" framing is irrelevant
                                                // while the task is paused.
                                                const deadline = (col.key === 'completed' || isPaused) ? null : deadlineState(t.dueDate);
                                                const previewText = t.description ? htmlToPlainText(t.description).slice(0, 140) : '';
                                                const attachmentCount = Array.isArray(t.attachments) ? t.attachments.length : 0;
                                                const isOverdueCard = col.key === 'overdue';
                                                const isPending = pendingId === t.id;
                                                const isDragging = draggingId === t.id;
                                                const isMine = !!t.assignee && t.assignee.id === myId;
                                                const isUnclaimed = t.status === 'todo' && !t.assignee;
                                                const isInProgress = t.status !== 'done' && t.status !== 'pending' && !!t.assignee;
                                                const isDone = t.status === 'done';
                                                // Determine which quick-action button to show.
                                                let actionBtn: { label: string; icon: typeof Hand; onClick: () => void; tone: string } | null = null;
                                                if (isPaused && (isMine || profile?.role === 'leader' || profile?.role === 'admin')) {
                                                    actionBtn = { label: 'Resume', icon: PlayCircle, onClick: () => handleResume(t), tone: 'bg-amber-600 hover:bg-amber-700 text-white' };
                                                } else if (isUnclaimed) {
                                                    actionBtn = { label: 'Claim', icon: Hand, onClick: () => handleClaim(t), tone: 'bg-sky-600 hover:bg-sky-700 text-white' };
                                                } else if (isInProgress && isMine) {
                                                    actionBtn = { label: 'Mark Complete', icon: Check, onClick: () => handleComplete(t), tone: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
                                                } else if (isDone && isMine) {
                                                    actionBtn = { label: 'Reopen', icon: RotateCcw, onClick: () => handleReopen(t), tone: 'bg-slate-600 hover:bg-slate-700 text-white' };
                                                }
                                                const draggable = canDrag(t) && !isPending;
                                                const isMenuOpen = menuOpenId === t.id;
                                                const isPickerOpen = assignPickerForId === t.id;
                                                const archived = !!t.archivedByMe;
                                                return (
                                                    <div
                                                        key={t.id}
                                                        ref={(el) => { cardRefs.current[t.id] = el; }}
                                                        draggable={draggable}
                                                        onDragStart={draggable ? (e) => {
                                                            setDraggingId(t.id);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                            e.dataTransfer.setData('text/plain', t.id);
                                                        } : undefined}
                                                        onDragEnd={draggable ? () => {
                                                            setDraggingId(null);
                                                            setDragOverColumn(null);
                                                        } : undefined}
                                                        onClick={() => openTaskInChannel(t)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                openTaskInChannel(t);
                                                            }
                                                        }}
                                                        title={isPaused && t.pendingReason ? `Paused: ${t.pendingReason}` : (!draggable && t.assignee ? `Claimed by ${t.assignee.name} — only they can move this card` : undefined)}
                                                        className={`text-left block w-full rounded-xl bg-white border ${isPaused ? 'border-amber-300 bg-amber-50/50' : isOverdueCard ? 'border-rose-200' : 'border-slate-200'} hover:shadow-md ${col.ringClass} transition-all p-3 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''} ${isPending ? 'opacity-60 pointer-events-none' : ''} ${archived ? 'opacity-70' : ''}`}
                                                    >
                                                        {/* Top row — assigner + relative time + 3-dot menu */}
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                            <span className="text-xs font-semibold text-slate-700 truncate">
                                                                {t.requesterName || 'Someone'}
                                                            </span>
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                <span className="text-[10px] text-slate-400">{formatRelative(t.createdAt)}</span>
                                                                <div className="relative">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setAssignPickerForId(null);
                                                                            setMenuOpenId(isMenuOpen ? null : t.id);
                                                                        }}
                                                                        className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                                                        aria-label="More options"
                                                                    >
                                                                        <MoreVertical className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    {isMenuOpen && !isPickerOpen && (
                                                                        <div
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="absolute z-30 right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1"
                                                                        >
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setAssignPickerForId(t.id);
                                                                                    setPickerSearch('');
                                                                                    ensurePickerMembers();
                                                                                }}
                                                                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                            >
                                                                                <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                                                                                Assign to Other Member
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleToggleSave(t); }}
                                                                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                            >
                                                                                <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                                                                                Save for Later
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); openForward(t); }}
                                                                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                            >
                                                                                <Forward className="w-3.5 h-3.5 text-sky-500" />
                                                                                Forward
                                                                            </button>
                                                                            {/* Request Help — only the assignee can flip needsHelp.
                                                                                Server already enforces this (403 otherwise), but
                                                                                we hide the menu item to avoid a misleading row. */}
                                                                            {t.assignee?.id === myId && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); handleToggleHelp(t); }}
                                                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                                >
                                                                                    <Hand className={`w-3.5 h-3.5 ${t.needsHelp ? 'text-emerald-500' : 'text-rose-500'}`} />
                                                                                    {t.needsHelp ? 'Cancel Help Request' : 'Request Help'}
                                                                                </button>
                                                                            )}
                                                                            {/* Pending actions — same authorization gate as the
                                                                                server's canManagePending check. Only assignee,
                                                                                requester, or leader/admin sees these items;
                                                                                everyone else's menu skips them entirely. */}
                                                                            {(() => {
                                                                                const myEmail = profile?.email?.toLowerCase();
                                                                                const requesterEmail = t.requesterEmail?.toLowerCase();
                                                                                const canManagePending =
                                                                                    isLeader ||
                                                                                    profile?.role === 'admin' ||
                                                                                    (t.assignee?.id && t.assignee.id === myId) ||
                                                                                    (!!myEmail && !!requesterEmail && myEmail === requesterEmail);
                                                                                if (!canManagePending) return null;
                                                                                if (!isDone && !isPaused) {
                                                                                    return (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); openPendingModal(t); }}
                                                                                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                                        >
                                                                                            <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                                                                                            Mark as Pending
                                                                                        </button>
                                                                                    );
                                                                                }
                                                                                if (isPaused) {
                                                                                    return (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); handleResume(t); }}
                                                                                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                                        >
                                                                                            <PlayCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                                                            Resume
                                                                                        </button>
                                                                                    );
                                                                                }
                                                                                return null;
                                                                            })()}
                                                                            {isDone && (
                                                                                <>
                                                                                    <div className="my-1 border-t border-slate-100" />
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            archived ? handleUnarchive(t) : handleArchive(t);
                                                                                        }}
                                                                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                                                                    >
                                                                                        {archived ? (
                                                                                            <><ArchiveRestore className="w-3.5 h-3.5 text-emerald-500" /> Restore</>
                                                                                        ) : (
                                                                                            <><Archive className="w-3.5 h-3.5 text-slate-500" /> Archive</>
                                                                                        )}
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {isMenuOpen && isPickerOpen && (
                                                                        <div
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="absolute z-30 right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                                                                        >
                                                                            <div className="p-2 border-b border-slate-100">
                                                                                <input
                                                                                    type="text"
                                                                                    value={pickerSearch}
                                                                                    onChange={(e) => setPickerSearch(e.target.value)}
                                                                                    placeholder="Search members..."
                                                                                    autoFocus
                                                                                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                                                                                />
                                                                            </div>
                                                                            <div className="max-h-56 overflow-y-auto py-1">
                                                                                {pickerLoading ? (
                                                                                    <div className="px-3 py-3 text-xs text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
                                                                                ) : (() => {
                                                                                    const q = pickerSearch.trim().toLowerCase();
                                                                                    const filtered = q ? pickerMembers.filter(m => m.name.toLowerCase().includes(q)) : pickerMembers;
                                                                                    if (filtered.length === 0) return <div className="px-3 py-3 text-xs text-slate-500">No members found</div>;
                                                                                    return filtered.map(m => (
                                                                                        <button
                                                                                            key={m.id}
                                                                                            type="button"
                                                                                            onClick={(e) => { e.stopPropagation(); handleReassign(t, m.id); }}
                                                                                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50"
                                                                                        >
                                                                                            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[10px] font-bold flex items-center justify-center overflow-hidden flex-shrink-0">
                                                                                                {m.image ? (
                                                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                                                    <img src={m.image} alt={m.name} className="w-6 h-6 rounded-full object-cover" />
                                                                                                ) : (
                                                                                                    m.name.charAt(0).toUpperCase()
                                                                                                )}
                                                                                            </span>
                                                                                            <span className="truncate">{m.name}</span>
                                                                                        </button>
                                                                                    ));
                                                                                })()}
                                                                            </div>
                                                                            <div className="px-2 py-1.5 border-t border-slate-100 flex justify-end">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); setAssignPickerForId(null); }}
                                                                                    className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-0.5"
                                                                                >
                                                                                    Back
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Description preview */}
                                                        <p className="text-sm text-slate-800 line-clamp-2 mb-2">
                                                            {previewText || <span className="italic text-slate-400">No description</span>}
                                                        </p>

                                                        {/* Priority + deadline row */}
                                                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                                            {t.urgency && (
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tone.bg} ${tone.text} ${tone.border}`}>
                                                                    {t.urgency}
                                                                </span>
                                                            )}
                                                            {isPaused && (
                                                                <span
                                                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-0.5"
                                                                    title={t.pendingReason || 'On hold'}
                                                                >
                                                                    <PauseCircle className="w-3 h-3" /> Paused
                                                                </span>
                                                            )}
                                                            {deadline && (
                                                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                                                    deadline.tone === 'overdue' ? 'bg-rose-100 text-rose-700' :
                                                                    deadline.tone === 'soon' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-slate-100 text-slate-600'
                                                                }`}>
                                                                    {deadline.label}
                                                                </span>
                                                            )}
                                                            {attachmentCount > 0 && (
                                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 inline-flex items-center gap-0.5">
                                                                    <Paperclip className="w-3 h-3" /> {attachmentCount}
                                                                </span>
                                                            )}
                                                            {t.needsHelp && (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 inline-flex items-center gap-0.5">
                                                                    <Hand className="w-3 h-3" /> Help wanted
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Checklist progress — Trello-style icon + count + bar.
                                                            Hidden when there are no items so empty cards stay clean. */}
                                                        {t.checklist && t.checklist.total > 0 && (() => {
                                                            const { total, completed } = t.checklist;
                                                            const pct = Math.round((completed / total) * 100);
                                                            const done = completed === total;
                                                            return (
                                                                <div className="mb-2">
                                                                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-1">
                                                                        <ListChecks className={`w-3.5 h-3.5 ${done ? 'text-emerald-500' : 'text-slate-400'}`} />
                                                                        <span className={done ? 'text-emerald-600' : ''}>
                                                                            {completed}/{total} ({pct}%)
                                                                        </span>
                                                                    </div>
                                                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                                            style={{ width: `${pct}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Pending reason — visible callout on paused cards so the
                                                            assignee and anyone reviewing the kanban can see why this
                                                            task isn't moving without having to hover for a tooltip. */}
                                                        {isPaused && t.pendingReason && (
                                                            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2 leading-relaxed">
                                                                <span className="font-semibold">
                                                                    {t.pendingTag && PENDING_TAG_LABEL[t.pendingTag]
                                                                        ? PENDING_TAG_LABEL[t.pendingTag]
                                                                        : 'On hold'}
                                                                    :
                                                                </span>{' '}
                                                                <span className="line-clamp-2">{t.pendingReason}</span>
                                                            </div>
                                                        )}

                                                        {/* Claim metadata — visible whenever the task has been claimed.
                                                            Mirrors Trello: "Claimed by Alif · Apr 30 at 11:42 AM". */}
                                                        {t.assignee && t.claimedAt && (
                                                            <div className="text-[11px] text-slate-500 mb-2 inline-flex items-center gap-1.5">
                                                                <Hand className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                                <span className="truncate">
                                                                    Claimed by <span className="font-semibold text-slate-700">{isMine ? 'you' : t.assignee.name}</span>
                                                                    {' · '}
                                                                    {formatClaimedAt(t.claimedAt)}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Quick action — Claim / Mark Complete / Reopen.
                                                            Stops propagation so the click doesn't also navigate to the channel. */}
                                                        {actionBtn && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); actionBtn!.onClick(); }}
                                                                disabled={isPending}
                                                                className={`w-full mb-2 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${actionBtn.tone}`}
                                                            >
                                                                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <actionBtn.icon className="w-3.5 h-3.5" />}
                                                                {actionBtn.label}
                                                            </button>
                                                        )}

                                                        {/* Footer — channel + assignee */}
                                                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                                            <span className="text-[10px] text-slate-500 inline-flex items-center gap-1 truncate">
                                                                <Hash className="w-3 h-3" /> {t.targetChannel?.name || '—'}
                                                            </span>
                                                            {t.assignee ? (
                                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold overflow-hidden flex-shrink-0" title={t.assignee.name}>
                                                                    {t.assignee.image ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img src={t.assignee.image} alt={t.assignee.name} className="w-5 h-5 rounded-full object-cover" />
                                                                    ) : (
                                                                        t.assignee.name.charAt(0).toUpperCase()
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                                                                    Open
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </section>
                                );
                            })}
                        </div>
                    </>
                );
            })()}

            <ForwardToChannelModal
                open={!!forwardData}
                onClose={() => setForwardData(null)}
                originalAuthor={forwardData?.originalAuthor || ''}
                originalContent={forwardData?.originalContent || ''}
                originalAttachments={forwardData?.originalAttachments || []}
                isTaskForward={forwardData?.isTaskForward}
                taskToken={forwardData?.taskToken}
                taskId={forwardData?.taskId}
            />

            {/* Mark-as-Pending modal — captures a structured tag + free-text
                reason so the requester sees a meaningful "your task is paused
                because X" notification, and reporting can group blockers
                later. Tag stays on the task even after resume so post-mortems
                can answer "what kept us blocked the longest". */}
            {pendingModalTask && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => !pendingModalSubmitting && setPendingModalTask(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <PauseCircle className="w-5 h-5 text-amber-500" />
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Mark task as Pending</h3>
                                    <p className="text-[11px] text-slate-500 line-clamp-1">{pendingModalTask.title}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !pendingModalSubmitting && setPendingModalTask(null)}
                                disabled={pendingModalSubmitting}
                                className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Pause the overdue clock while you wait on something external.
                                The requester will get a notification with your reason so they
                                can chase the blocker on their side.
                            </p>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Blocker</label>
                                <select
                                    value={pendingModalTag}
                                    onChange={(e) => setPendingModalTag(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                                >
                                    {PENDING_TAGS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason <span className="text-rose-500">*</span></label>
                                <textarea
                                    value={pendingModalReason}
                                    onChange={(e) => setPendingModalReason(e.target.value)}
                                    rows={3}
                                    placeholder="e.g. Waiting on brand to confirm the new price for SKU-203."
                                    autoFocus
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setPendingModalTask(null)}
                                disabled={pendingModalSubmitting}
                                className="px-4 py-2 text-sm text-slate-600 rounded-full hover:bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitPending}
                                disabled={!pendingModalReason.trim() || pendingModalSubmitting}
                                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {pendingModalSubmitting ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pausing…</>
                                ) : (
                                    <><PauseCircle className="w-3.5 h-3.5" /> Pause task</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
