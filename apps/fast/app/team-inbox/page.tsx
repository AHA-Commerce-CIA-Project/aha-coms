'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox, Paperclip, AlertTriangle, Hash, Clock, CheckCircle2, Circle, Hand, Check, RotateCcw, Loader2, MoreVertical, UserPlus, Bookmark, Forward, Archive, ArchiveRestore, PauseCircle, PlayCircle, X, ListChecks, Eye, ExternalLink, Plus, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/sanitize';
import { PageTabs } from '@/components/PageTabs';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';
import { TeamInboxTaskModal, type TeamInboxTask } from '@/components/TeamInboxTaskModal';
import { CreatePersonalCardModal } from '@/components/CreatePersonalCardModal';
import { RoutineTaskDetailModal } from '@/components/channels/RoutineTaskDetailModal';

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
    // ISO timestamp when this row was personally-archived; null when the
    // user hasn't archived it. Drives the Archive view's sort dropdown.
    archivedAt?: string | null;
    // True when the task is past the rolling auto-archive window (24h for
    // routine reminders, 72h for standard tasks). Computed server-side
    // in /api/team-inbox so the cutoff respects server time. Mutually
    // independent of `archivedByMe` — a task can be either, both, or
    // neither. The client treats them the same way: hide from the
    // Kanban columns, surface in the Archive view.
    autoArchivedByAge?: boolean;
    pendingReason?: string | null;
    pendingTag?: string | null;
    pendedAt?: string | null;
    pendedFromStatus?: string | null;
    needsHelp?: boolean;
    checklist?: { total: number; completed: number };
    // Non-null when this task was spawned by the AHABOT routine scheduler.
    // Drives the Routine Reminders tab + the "AHABOT" requester label.
    routineTemplate?: { id: string; name: string } | null;
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

// Inner content as a separate function so the default export can wrap
// it in <Suspense>. Required because we read `useSearchParams()` to
// seed `showArchivedOnly` from the URL (PR #47's deep-link feature),
// and Next.js refuses to statically prerender any page that calls
// useSearchParams outside a Suspense boundary — it bailed the prod
// build for PR #47 with `Error occurred prerendering page
// /team-inbox`. Mirrors the existing pattern in /track/page.tsx.
function TeamInboxContent() {
    const { profile, isLeader } = useAuth();
    const router = useRouter();
    const isMaster = profile?.role === 'admin';

    const [tasks, setTasks] = useState<InboxTask[]>([]);
    // Pill-tab switcher: 'standard' shows direct-assigned tasks; 'routine'
    // shows AHABOT-spawned routine reminders. Filters everything downstream
    // (stats strip + kanban buckets) so the two surfaces stay clean.
    const [activeTab, setActiveTab] = useState<'standard' | 'routine'>('standard');
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
    // Local task-detail modal — opened from the "View Details" button so the
    // user can inspect/edit a task without leaving the inbox. Standard tasks
    // use TeamInboxTaskModal; routine reminders use the richer
    // RoutineTaskDetailModal (which already carries the reassign + checklist
    // + comments affordances they share with the in-channel card view).
    const [detailTask, setDetailTask] = useState<TeamInboxTask | null>(null);
    const [routineDetailTaskId, setRoutineDetailTaskId] = useState<string | null>(null);
    const [assignPickerForId, setAssignPickerForId] = useState<string | null>(null);
    const [pickerMembers, setPickerMembers] = useState<PickerMember[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    // Forward-to-channel modal payload. Mirrors the pattern in /nexus.
    const [forwardData, setForwardData] = useState<ForwardPayload | null>(null);
    // CreatePersonalCardModal open/close — the "+ Create Card" button in
    // the toolbar drives this. Distinct from the leader-only Create Task
    // wizard at /tasks; this one self-assigns.
    const [createCardOpen, setCreateCardOpen] = useState(false);

    // Layout switcher between the four-column Kanban (`board`) and the
    // dense single-table view (`list`). Tracked per-session; not
    // persisted to localStorage today (could add if there's a real ask).
    type ViewMode = 'board' | 'list';
    const [viewMode, setViewMode] = useState<ViewMode>('board');

    // Archive view toggle — when true, the four-column Kanban is replaced
    // by a single-column archived-only list. When false, archived rows are
    // filtered out of the regular buckets. Toggled by clicking the
    // ARCHIVED metric chip; also seeded from the `?showArchivedOnly=1`
    // URL param so deep-links from the channel card's "Open in Team
    // Inbox" button on an archived task land directly in the archive
    // view instead of the default Kanban.
    const initialSearchParams = useSearchParams();
    const [showArchivedOnly, setShowArchivedOnly] = useState(
        initialSearchParams?.get('showArchivedOnly') === '1'
    );
    // Sort/filter applied inside the Archive view. Defaults to "Newest
    // Archived" so the row the user just archived sits at the top.
    type ArchiveSort = 'newest' | 'oldest' | 'last30' | 'all';
    const [archiveSort, setArchiveSort] = useState<ArchiveSort>('newest');
    // Free-text filter applied to title + plain-text description before
    // bucketing. Client-side only; the API doesn't get a search param.
    const [searchQuery, setSearchQuery] = useState('');
    // Mark-as-Pending modal — opened from the 3-dot menu. Free-text reason
    // plus a structured tag so reporting can group blockers later.
    const [pendingModalTask, setPendingModalTask] = useState<InboxTask | null>(null);
    const [pendingModalReason, setPendingModalReason] = useState('');
    const [pendingModalTag, setPendingModalTag] = useState<string>('waiting_on_brand');
    const [pendingModalSubmitting, setPendingModalSubmitting] = useState(false);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Open the local task-detail modal — keeps the user on /team-inbox so they
    // can inspect details + run the checklist without losing their place.
    // Routine reminders open the dedicated RoutineTaskDetailModal so leaders
    // and current claimers can reassign from the same surface they use in
    // channels; standard tasks keep their existing TeamInboxTaskModal. The
    // cast on the standard branch is safe because TeamInboxTask is
    // structurally a subset of InboxTask.
    const openDetail = (t: InboxTask) => {
        if (t.routineTemplate) {
            setRoutineDetailTaskId(t.id);
        } else {
            setDetailTask(t as unknown as TeamInboxTask);
        }
    };

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

    const fetchInbox = useCallback(async (teamId?: string | null) => {
        setLoading(true);
        setError(null);
        try {
            // Always include archived rows so the ARCHIVED metric chip has
            // an accurate count and the archive-only view has data the
            // moment the user toggles into it. The client filters them
            // out of the regular buckets when not in archive-only mode.
            const params = new URLSearchParams({ showArchived: '1' });
            if (teamId) params.set('teamId', teamId);
            const qs = params.toString();
            const url = `/fast/api/team-inbox?${qs}`;
            const res = await fetch(url);
            // Parse the body as text first so a server-side crash (which often
            // returns an empty body or HTML error page) doesn't blow up the
            // page with "Failed to execute 'json' on 'Response': Unexpected
            // end of JSON input". We map status → message and surface a
            // useful banner instead.
            const rawText = await res.text();
            let data: any = null;
            try { data = rawText ? JSON.parse(rawText) : null; } catch { data = null; }
            if (!res.ok) {
                const reason = data?.error
                    || (res.status >= 500 ? `Server error (HTTP ${res.status}). Try again in a moment.` : `Request failed (HTTP ${res.status}).`);
                throw new Error(reason);
            }
            setTasks(data?.tasks || []);
            if (!selectedTeamId && data?.teamId) setSelectedTeamId(data.teamId);
        } catch (err: any) {
            setError(err?.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [selectedTeamId]);

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
            `/fast/api/tasks/${task.id}/claim`,
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
            `/fast/api/tasks/${task.id}/quick-complete`,
            (t) => ({ ...t, status: 'done', completedAt: new Date().toISOString() }),
            'Failed to mark complete',
        );

    const handleReopen = (task: InboxTask) =>
        runQuickAction(
            task,
            `/fast/api/tasks/${task.id}/reopen`,
            (t) => ({ ...t, status: 'in-progress', completedAt: null }),
            'Failed to reopen task',
        );

    const handleAcknowledgeOverdue = (task: InboxTask) =>
        runQuickAction(
            task,
            `/fast/api/tasks/${task.id}/acknowledge-overdue`,
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
            const res = await fetch(`/fast/api/tasks/${pendingModalTask.id}/pending`, {
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
            const res = await fetch(`/fast/api/tasks/${task.id}/pending`, { method: 'DELETE' });
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
        // Optimistic: flip the archive flag in place and stamp archivedAt
        // with the local clock so "Newest Archived" sort lifts the row to
        // the top of the Archive grid without waiting for a refetch. The
        // bucketing pass downstream slides the task between views.
        const nowIso = new Date().toISOString();
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, archivedByMe: true, archivedAt: nowIso } : t)));
        try {
            const res = await fetch(`/fast/api/tasks/${task.id}/personal-archive`, { method: 'POST' });
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
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, archivedByMe: false, archivedAt: null } : t)));
        try {
            const res = await fetch(`/fast/api/tasks/${task.id}/personal-archive`, { method: 'DELETE' });
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
            const res = await fetch(`/fast/api/tasks/${task.id}/save`, { method: 'POST' });
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
            const res = await fetch(`/fast/api/tasks/${task.id}/request-help`, {
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
            const res = await fetch(`/fast/api/tasks/${task.id}/claim`, {
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
            const res = await fetch('/fast/api/chat/users');
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
        fetch('/fast/api/teams').then(r => r.ok ? r.json() : []).then(setTeams).catch(() => setTeams([]));
    }, [isMaster]);

    return (
        <div className="space-y-5">
            <PageTabs tabs={[
                { href: '/tasks', label: 'My Tasks' },
                { href: '/my-request', label: 'My Request' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Task Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ]} />
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-indigo-600" />
                    <h1 className="text-xl font-bold text-slate-800">Task Inbox</h1>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Client-side title + description filter. Applies before
                        bucketing so the metric counts also reflect what the
                        user is looking at, not the full unfiltered set. */}
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks…"
                        aria-label="Search tasks"
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-44 sm:w-56"
                    />
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
                    {/* Segmented Board/List toggle. Sits right of the team
                        selector so the primary "Create Card" CTA stays
                        rightmost / most prominent. */}
                    <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-0.5" role="tablist" aria-label="View mode">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'board'}
                            onClick={() => setViewMode('board')}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors',
                                viewMode === 'board'
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                            )}
                            title="Board view (Kanban)"
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Board</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'list'}
                            onClick={() => setViewMode('list')}
                            className={cn(
                                'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors',
                                viewMode === 'list'
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                            )}
                            title="List view (table)"
                        >
                            <ListIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">List</span>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCreateCardOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Create Card
                    </button>
                </div>
            </div>

            <p className="text-sm text-slate-500">
                Tasks posted into this team&apos;s Assign Task channels. Click a card to open the task and claim it.
            </p>

            {/* Pill switcher — same pattern as /nexus Open Queue / Direct
                Requests. Splits the inbox so routine reminders don't clutter
                the standard direct-assigned cards. The badge counts
                strictly reflect ACTIVE rows on the board (Unclaimed +
                In Progress + Completed + Pending + Overdue). Archived
                rows — whether manually archived (archivedByMe),
                auto-archived by the rolling-age cutoff
                (autoArchivedByAge), or stored with status='archived'
                — are excluded so the badge number always matches what
                the user sees in the four Kanban columns. */}
            {(() => {
                const isActiveRow = (t: InboxTask) =>
                    !t.archivedByMe && !t.autoArchivedByAge && t.status !== 'archived';
                const standardCount = tasks.filter(t => isActiveRow(t) && !t.routineTemplate).length;
                const routineCount = tasks.filter(t => isActiveRow(t) && !!t.routineTemplate).length;
                return (
                    <div className="flex justify-center">
                        <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex gap-1">
                            <button
                                onClick={() => setActiveTab('standard')}
                                className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'standard' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Standard Tasks
                                {standardCount > 0 && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === 'standard' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                                        {standardCount}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('routine')}
                                className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'routine' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Routine Reminders
                                {routineCount > 0 && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === 'routine' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                                        {routineCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                );
            })()}

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
                // Filter by the active pill before doing anything else so the
                // stats strip, empty state, and kanban all reflect the selected
                // tab. Routine reminders are detected via the routineTemplate
                // relation surfaced by /api/team-inbox.
                const pillFiltered = tasks.filter(t =>
                    activeTab === 'routine' ? !!t.routineTemplate : !t.routineTemplate,
                );

                // Apply the search filter against title + plain-text description.
                // Client-side so it tracks live with every keystroke.
                const q = searchQuery.trim().toLowerCase();
                const searched = q
                    ? pillFiltered.filter(t => {
                          if (t.title?.toLowerCase().includes(q)) return true;
                          if (t.description && htmlToPlainText(t.description).toLowerCase().includes(q)) return true;
                          return false;
                      })
                    : pillFiltered;

                // Split off the archived rows so the regular four-column
                // Kanban never sees them and the ARCHIVED chip / dedicated
                // view always have their full set.
                // A row counts as archived when EITHER the viewer
                // personally archived it (`archivedByMe`) OR the
                // server has aged it out per the rolling-window rule
                // (`autoArchivedByAge` — 24h routine / 72h standard).
                // The two reasons are independent and the kanban
                // doesn't care which fired; both flow to the Archive
                // view via the same set.
                const isArchivedRow = (t: InboxTask) => !!t.archivedByMe || !!t.autoArchivedByAge;
                const archivedAll = searched.filter(isArchivedRow);
                const visibleTasks = searched.filter(t => !isArchivedRow(t));

                // Sort + timeframe filter for the Archive view. archivedAt
                // is an ISO string from /api/team-inbox; missing values
                // (legacy rows or optimistic mid-flight ones the API hasn't
                // returned yet) fall back to createdAt so they still order.
                const archiveTs = (t: InboxTask): number => {
                    const v = t.archivedAt || t.completedAt || t.createdAt;
                    return v ? new Date(v).getTime() : 0;
                };
                const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
                const archivedTasks = (() => {
                    const cutoff = Date.now() - THIRTY_DAYS_MS;
                    const filtered = archiveSort === 'last30'
                        ? archivedAll.filter(t => archiveTs(t) >= cutoff)
                        : archivedAll;
                    const sorted = [...filtered].sort((a, b) =>
                        archiveSort === 'oldest' ? archiveTs(a) - archiveTs(b) : archiveTs(b) - archiveTs(a),
                    );
                    return sorted;
                })();

                // Bucket tasks into 4 mutually-exclusive columns. Overdue takes
                // precedence over the regular status — a P1 that's past its
                // due date lands in the Overdue column, not "In Progress",
                // so it stops getting overlooked. Pending tasks are EXEMPT
                // from Overdue — the assignee shouldn't be flagged for a
                // task that's blocked on someone else.
                const now = Date.now();
                const buckets = { unclaimed: [] as InboxTask[], inProgress: [] as InboxTask[], overdue: [] as InboxTask[], completed: [] as InboxTask[] };
                let pendingCount = 0;
                for (const t of visibleTasks) {
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
                // archivedCount drives the metric chip and stays decoupled
                // from the archive view's sort/timeframe dropdown — flipping
                // to "Last 30 Days" inside the archive view shouldn't
                // silently change the chip count the kanban view sees.
                const archivedCount = archivedAll.length;
                const total = visibleTasks.length + archivedCount;
                // Visible signal for the kanban side: when the user has typed
                // a query and the only hits are in archives, surface a count
                // on the chip so they don't conclude their search is empty.
                const searchHitsArchivedOnly = !!q && visibleTasks.length === 0 && archivedCount > 0;

                if (total === 0) {
                    const isRoutineTab = activeTab === 'routine';
                    return (
                        <div className="rounded-2xl bg-white border border-slate-200 px-6 py-12 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                                <Inbox className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 className="text-base font-bold text-slate-700 mb-1">
                                {isRoutineTab ? 'No routine reminders' : 'Inbox is empty'}
                            </h3>
                            <p className="text-sm text-slate-400">
                                {isRoutineTab
                                    ? 'AHABOT will post routine reminders here when scheduled templates fire.'
                                    : 'Direct-assigned tasks for your team will appear here as cards.'}
                            </p>
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
                        {/* Stats strip — 4 buckets + Pending + Archived.
                            Each chip is a button: clicking the four column
                            chips or the Pending chip returns the view to the
                            Kanban (showArchivedOnly = false); clicking the
                            ARCHIVED chip switches to the full-width archive-
                            only list. The current mode gets a ring so it
                            reads as the selected segment. */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {columns.map(c => (
                                <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => setShowArchivedOnly(false)}
                                    aria-pressed={!showArchivedOnly}
                                    className={`text-left rounded-2xl bg-white border ${!showArchivedOnly ? 'border-slate-200 hover:border-slate-300' : 'border-slate-100 hover:border-slate-200'} p-4 transition-colors`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <c.icon className={`w-3.5 h-3.5 ${c.iconClass}`} />
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{c.label}</span>
                                    </div>
                                    <div className={`text-2xl font-bold ${c.iconClass}`}>{buckets[c.key].length}</div>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setShowArchivedOnly(false)}
                                aria-pressed={!showArchivedOnly}
                                className={`text-left rounded-2xl bg-white border ${!showArchivedOnly ? 'border-amber-200 hover:border-amber-300' : 'border-amber-100 hover:border-amber-200'} p-4 transition-colors`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pending</span>
                                </div>
                                <div className="text-2xl font-bold text-amber-500">{pendingCount}</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowArchivedOnly((v) => !v)}
                                aria-pressed={showArchivedOnly}
                                title={
                                    showArchivedOnly
                                        ? 'Click to return to all columns'
                                        : searchHitsArchivedOnly
                                        ? `Your search matches ${archivedCount} archived task${archivedCount === 1 ? '' : 's'} — click to view.`
                                        : undefined
                                }
                                className={`text-left rounded-2xl bg-white border p-4 transition-colors ${
                                    showArchivedOnly
                                        ? 'border-indigo-300 ring-2 ring-indigo-100'
                                        : searchHitsArchivedOnly
                                        ? 'border-indigo-300 ring-2 ring-indigo-100'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Archive className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Archived</span>
                                </div>
                                <div className={`text-2xl font-bold ${searchHitsArchivedOnly ? 'text-indigo-600' : 'text-slate-700'}`}>{archivedCount}</div>
                                {searchHitsArchivedOnly && (
                                    <div className="text-[10px] font-medium text-indigo-500 mt-0.5">
                                        Only match{archivedCount === 1 ? '' : 'es'} — click to view
                                    </div>
                                )}
                            </button>
                        </div>

                        {/* Action error toast — non-blocking, auto-dismisses after 4s. */}
                        {actionError && (
                            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {actionError}
                            </div>
                        )}

                        {/* Render gate: List view trumps Board/Archive when the
                            user picked it. Inside list mode we still respect
                            the Archived chip — the table just sources from
                            archivedTasks instead of visibleTasks. */}
                        {viewMode === 'list' ? (() => {
                            const rows = showArchivedOnly ? archivedTasks : visibleTasks;
                            if (rows.length === 0) {
                                return (
                                    <div className="rounded-2xl bg-white border border-slate-200 px-6 py-12 text-center">
                                        <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm text-slate-400">
                                            {showArchivedOnly
                                                ? (q ? 'No archived tasks match your search.' : 'No archived tasks yet.')
                                                : (q ? 'No tasks match your search.' : 'No tasks in your inbox.')}
                                        </p>
                                    </div>
                                );
                            }
                            return (
                                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Token</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Priority</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Requester</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Submitted</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Deadline</th>
                                                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                                                    {isMaster && (
                                                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Team</th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {rows.map(t => {
                                                    const tone = (t.urgency && PRIORITY_TONE[t.urgency]) || PRIORITY_TONE.P3;
                                                    const isRoutine = !!t.routineTemplate;
                                                    const requesterLabel = isRoutine ? 'AHABOT' : (t.requesterName || '—');
                                                    const isDone = t.status === 'done';
                                                    const isPaused = t.status === 'pending';
                                                    const statusLabel = isDone ? 'Completed'
                                                        : isPaused ? 'Pending'
                                                        : t.status === 'todo' && !t.assignee ? 'Unclaimed'
                                                        : 'In Progress';
                                                    const statusClass = isDone
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : isPaused
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : t.status === 'todo' && !t.assignee
                                                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200';
                                                    const deadline = (isDone || isPaused) ? null : deadlineState(t.dueDate);
                                                    return (
                                                        <tr
                                                            key={t.id}
                                                            onClick={() => openDetail(t)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    openDetail(t);
                                                                }
                                                            }}
                                                            tabIndex={0}
                                                            className="hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                                                        >
                                                            <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                                                                {t.taskToken ? `#${t.taskToken}` : '—'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                {t.urgency && (
                                                                    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${tone.bg} ${tone.text} ${tone.border}`}>
                                                                        {t.urgency}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className="text-sm font-medium text-slate-800 line-clamp-1">{t.title}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                                                                {requesterLabel}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                                {formatRelative(t.createdAt)}
                                                            </td>
                                                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                                {deadline ? (
                                                                    <span className={
                                                                        deadline.tone === 'overdue' ? 'text-rose-600 font-semibold'
                                                                        : deadline.tone === 'soon' ? 'text-amber-600 font-semibold'
                                                                        : 'text-slate-600'
                                                                    }>{deadline.label}</span>
                                                                ) : (
                                                                    <span className="text-slate-400">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded border ${statusClass}`}>
                                                                    {statusLabel}
                                                                </span>
                                                            </td>
                                                            {isMaster && (
                                                                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                                    {t.assignedTeam?.name || '—'}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })() : showArchivedOnly ? (
                            <div className="space-y-3">
                                {/* Sub-header — title + sort dropdown. The
                                    "← Back to all" text button was removed in
                                    PR #49: the Archived metric chip now
                                    toggles (PR #47), so a second click on the
                                    chip is the canonical way out — keeping
                                    two redundant exits cluttered the row. */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <Archive className="w-4 h-4 text-slate-500" /> Archived
                                        <span className="text-xs font-medium text-slate-400">
                                            ({archivedTasks.length}{archivedTasks.length !== archivedAll.length ? ` of ${archivedAll.length}` : ''})
                                        </span>
                                    </h3>
                                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                        <span className="font-medium">Sort</span>
                                        <select
                                            value={archiveSort}
                                            onChange={(e) => setArchiveSort(e.target.value as ArchiveSort)}
                                            aria-label="Sort archived tasks"
                                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                                        >
                                            <option value="newest">Newest Archived</option>
                                            <option value="oldest">Oldest Archived</option>
                                            <option value="last30">Last 30 Days</option>
                                            <option value="all">All Time</option>
                                        </select>
                                    </label>
                                </div>

                                {archivedTasks.length === 0 ? (
                                    <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
                                        <Archive className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm text-slate-400">
                                            {q
                                                ? 'No archived tasks match your search.'
                                                : archiveSort === 'last30'
                                                ? 'Nothing archived in the last 30 days.'
                                                : 'No archived tasks yet.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {archivedTasks.map(t => {
                                            const tone = (t.urgency && PRIORITY_TONE[t.urgency]) || PRIORITY_TONE.P3;
                                            const isRoutine = !!t.routineTemplate;
                                            const requesterLabel = isRoutine ? 'AHABOT' : (t.requesterName || 'Someone');
                                            return (
                                                <div
                                                    key={t.id}
                                                    onClick={() => openDetail(t)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            openDetail(t);
                                                        }
                                                    }}
                                                    role="button"
                                                    tabIndex={0}
                                                    className="rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-3 flex flex-col gap-2 opacity-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold text-slate-700 truncate">{requesterLabel}</span>
                                                        {t.urgency && (
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tone.bg} ${tone.text} ${tone.border} flex-shrink-0`}>
                                                                {t.urgency}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Title is plain text inside the clickable wrapper —
                                                        nesting a <button> here would steal focus + click
                                                        from the wrapper and re-introduce the dead-zone
                                                        bug this PR is fixing. */}
                                                    <p className="text-sm font-bold text-slate-900 line-clamp-2">
                                                        {t.title}
                                                    </p>
                                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                                        <span className="truncate">
                                                            {t.assignee?.name
                                                                ? `Done by ${t.assignee.name.split(' ').slice(0, 2).join(' ')}`
                                                                : 'Unassigned'}
                                                        </span>
                                                        {t.taskToken && (
                                                            <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">#{t.taskToken}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                                        <span className="text-[10px] text-slate-400 truncate">
                                                            {t.archivedByMe
                                                                ? `Archived ${t.archivedAt ? formatRelative(t.archivedAt) : '—'}`
                                                                : t.autoArchivedByAge
                                                                ? `Auto-archived · completed ${t.completedAt ? formatRelative(t.completedAt) : '—'}`
                                                                : `Archived ${t.archivedAt ? formatRelative(t.archivedAt) : '—'}`}
                                                        </span>
                                                        {/* Restore only restores PERSONAL archives. Auto-
                                                            archived rows have no archive record to
                                                            negate — clicking Restore would either 404
                                                            or just bounce back into the archive on the
                                                            next render. Hide for those rows; the user
                                                            can verify completion via the card click
                                                            instead. */}
                                                        {t.archivedByMe && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleUnarchive(t); }}
                                                                disabled={pendingId === t.id}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
                                                            >
                                                                <ArchiveRestore className="w-3 h-3" /> Restore
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                        /* Kanban — 4 columns, responsive (1 col mobile / 2 col tablet / 4 col desktop).
                           Drag a card from one column header onto another to advance status:
                             Unclaimed → In Progress (= claim, anyone)
                             In Progress → Completed (assignee only)
                             Completed → In Progress (assignee only, undo)
                           Overdue stays a derived bucket — drops onto it are no-ops. */
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
                                                // Routine-spawned tasks always show the routine's title in
                                                // place of the description. Spec calls this out explicitly:
                                                // a reminder card represents the routine, not a freeform
                                                // request, so the human-meaningful label is the routine
                                                // template's name.
                                                const isRoutine = !!t.routineTemplate;
                                                const previewText = isRoutine
                                                    ? (t.routineTemplate?.name ?? '')
                                                    : (t.description ? htmlToPlainText(t.description).slice(0, 140) : '');
                                                // Routine reminders come from AHABOT, not a human requester.
                                                const requesterLabel = isRoutine ? 'AHABOT' : (t.requesterName || 'Someone');
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
                                                // In-progress cards owned by the viewer get a two-button row
                                                // (View Details + Go to Channel) instead of a Mark Complete
                                                // primary — completion is handled by drag-and-drop into the
                                                // Done column. Computed below in `showQuickInspect`.
                                                if (isPaused && (isMine || profile?.role === 'leader' || profile?.role === 'admin')) {
                                                    actionBtn = { label: 'Resume', icon: PlayCircle, onClick: () => handleResume(t), tone: 'bg-amber-600 hover:bg-amber-700 text-white' };
                                                } else if (isUnclaimed) {
                                                    actionBtn = { label: 'Claim', icon: Hand, onClick: () => handleClaim(t), tone: 'bg-sky-600 hover:bg-sky-700 text-white' };
                                                } else if (isDone && isMine) {
                                                    actionBtn = { label: 'Reopen', icon: RotateCcw, onClick: () => handleReopen(t), tone: 'bg-slate-600 hover:bg-slate-700 text-white' };
                                                }
                                                const showQuickInspect = isInProgress && isMine;
                                                const draggable = canDrag(t) && !isPending;
                                                const isMenuOpen = menuOpenId === t.id;
                                                const isPickerOpen = assignPickerForId === t.id;
                                                const archived = !!t.archivedByMe;
                                                // Personal Create-Card rows have no source channel,
                                                // so the wrapper's "click to jump to channel"
                                                // navigation has nowhere meaningful to land. Freeze
                                                // the wrapper for those rows: no onClick, no
                                                // keyboard activation, no role=button. The two
                                                // explicit action buttons inside the card (View
                                                // Details + the conditional Go to Channel) remain
                                                // the only interactive surfaces.
                                                const isPersonal = !t.targetChannel;
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
                                                        onClick={isPersonal ? undefined : () => openTaskInChannel(t)}
                                                        role={isPersonal ? undefined : 'button'}
                                                        tabIndex={isPersonal ? -1 : 0}
                                                        onKeyDown={isPersonal ? undefined : (e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                openTaskInChannel(t);
                                                            }
                                                        }}
                                                        title={isPaused && t.pendingReason ? `Paused: ${t.pendingReason}` : (!draggable && t.assignee ? `Claimed by ${t.assignee.name} — only they can move this card` : undefined)}
                                                        className={`text-left block w-full rounded-xl bg-white border ${isPaused ? 'border-amber-300 bg-amber-50/50' : isDone ? 'border-emerald-300 bg-emerald-50/40' : isOverdueCard ? 'border-rose-200' : 'border-slate-200'} hover:shadow-md ${col.ringClass} transition-all p-3 ${draggable ? 'cursor-grab active:cursor-grabbing' : isPersonal ? 'cursor-default' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''} ${isPending ? 'opacity-60 pointer-events-none' : ''} ${archived ? 'opacity-70' : ''}`}
                                                    >
                                                        {/* Top row — assigner + relative time + 3-dot menu */}
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                            <span className="text-xs font-semibold text-slate-700 truncate">
                                                                {requesterLabel}
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
                                                                            {/* Reassign — only visible while a task is actively
                                                                                in-progress AND the viewer is the current claimer.
                                                                                Hand-offs only make sense mid-flight, and only the
                                                                                claimer should be able to reassign their own task.
                                                                                Hidden (not disabled) so the menu doesn't suggest
                                                                                an action the viewer can't take. */}
                                                                            {t.status === 'in-progress' && t.assignee?.id === myId && (
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
                                                                            )}
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
                                                                            {isDone && (() => {
                                                                                // Archive / Restore — only the assignee, the
                                                                                // requester, or an Admin should be able to file
                                                                                // a completed task away. Hide the row for everyone
                                                                                // else so the menu doesn't suggest a no-op.
                                                                                const myEmail = profile?.email?.toLowerCase();
                                                                                const requesterEmail = t.requesterEmail?.toLowerCase();
                                                                                const canArchive =
                                                                                    profile?.role === 'admin' ||
                                                                                    (t.assignee?.id && t.assignee.id === myId) ||
                                                                                    (!!myEmail && !!requesterEmail && myEmail === requesterEmail);
                                                                                if (!canArchive) return null;
                                                                                return (
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
                                                                                );
                                                                            })()}
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

                                                        {/* Quick action — Claim / Resume / Reopen for non-in-progress states.
                                                            Mark Complete is intentionally gone: drag-and-drop into the Done
                                                            column handles completion, so the giant button was redundant. */}
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

                                                        {/* In-progress + mine — two secondary actions in
                                                            place of Mark Complete: View Details opens
                                                            the modal locally (no navigation); Go to
                                                            Channel jumps to the channel and scroll-
                                                            targets the source message. The Go to
                                                            Channel button is hidden entirely for
                                                            personal Create-Card rows since there is no
                                                            source channel to jump to. */}
                                                        {showQuickInspect && (
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); openDetail(t); }}
                                                                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    View Details
                                                                </button>
                                                                {!isPersonal && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); openTaskInChannel(t); }}
                                                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                                                    >
                                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                                        Go to Channel
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Footer — channel + assignee. Personal cards
                                                            (Create Card flow) have no targetChannel —
                                                            show "# Self-Assigned" as a static label so
                                                            the row visually mirrors the Self-Assigned
                                                            pill the create-card review screen shows,
                                                            and freeze pointer events on the badge so it
                                                            can't be hovered or click-traversed as if it
                                                            were a channel link. */}
                                                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                                            {t.targetChannel ? (
                                                                <span className="text-[10px] text-slate-500 inline-flex items-center gap-1 truncate">
                                                                    <Hash className="w-3 h-3" /> {t.targetChannel.name}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 truncate pointer-events-none select-none">
                                                                    <Hash className="w-3 h-3" /> Self-Assigned
                                                                </span>
                                                            )}
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
                        )}
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

            <CreatePersonalCardModal
                open={createCardOpen}
                onClose={() => setCreateCardOpen(false)}
                onCreated={() => fetchInbox(selectedTeamId)}
            />

            {/* Task-detail modal — opened by the View Details button on
                in-progress cards. onChange refetches the inbox so checklist
                progress / status changes from the modal show up in the cards. */}
            {detailTask && (
                <TeamInboxTaskModal
                    task={detailTask}
                    currentUserId={myId || undefined}
                    onClose={() => setDetailTask(null)}
                    onChange={() => fetchInbox(selectedTeamId)}
                />
            )}

            {/* Routine-task detail modal — same component the in-channel
                routine card opens. Brings reassign + checklist + comments to
                the team-inbox surface without duplicating the UI. Refetches
                the inbox on close so a reassign immediately reflects in the
                kanban cards. */}
            {routineDetailTaskId && (
                <RoutineTaskDetailModal
                    open={!!routineDetailTaskId}
                    taskId={routineDetailTaskId}
                    currentUserId={myId || ''}
                    onClose={() => {
                        setRoutineDetailTaskId(null);
                        fetchInbox(selectedTeamId);
                    }}
                />
            )}

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

// Default export wraps TeamInboxContent in <Suspense> so Next.js can
// statically prerender the page shell while letting the inner
// useSearchParams() call defer to client-side. Fallback mirrors the
// in-content loading spinner so users don't see a layout shift on
// the hand-off.
export default function TeamInboxPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            }
        >
            <TeamInboxContent />
        </Suspense>
    );
}
