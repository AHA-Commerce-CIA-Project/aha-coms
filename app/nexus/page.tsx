'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useCommentDraftTaskIds } from '@/lib/use-comment-drafts';
import { CountdownTimer } from '@/components/CountdownTimer';
import { DueCountdown } from '@/components/DueCountdown';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';

import {
    Inbox, Clock, CheckCircle2, AlertTriangle, Search,
    Eye, CheckSquare, ChevronLeft, ChevronRight, X,
    Timer, Star, FileText, UserPlus, Archive, Trash2, Edit3, ExternalLink, MessageSquare, Send, Forward, Plus, Pencil, PauseCircle,
} from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { PageTabs } from '@/components/PageTabs';
import { FilterChips } from '@/components/FilterChips';
import { htmlToPlainText } from '@/lib/sanitize';
import { ForwardTimer } from '@/components/ForwardTimer';
import { SaveTaskButton } from '@/components/SaveTaskButton';
import { TaskHelpPanel } from '@/components/TaskHelpPanel';
import { TaskCommentsSection } from '@/components/TaskCommentsSection';
import { ImageLightbox } from '@/components/ImageLightbox';
import { CreateTaskWizard } from '@/components/CreateTaskWizard';

interface TicketRow {
    id: string;
    title: string;
    description: string | null;
    status: string;
    urgency: string | null;
    task_token: string | null;
    requester_name: string | null;
    requester_email: string | null;
    requester_division: string | null;
    assignee_id: string | null;
    assigned_team_id?: string | null;
    assigned_team?: { id: string; name: string } | null;
    created_at: string;
    claimed_at: string | null;
    completed_at: string | null;
    due_date: string | null;
    request_type: string | null;
    attachment_link: string | null;
    impact_description: string | null;
    resolution_summary: string | null;
    difficulty_score: number | null;
    actual_time_spent: number | null;
    time_unit: string | null;
    completed_by: string | null;
    completed_by_id?: string | null;
    image_url: string | null;
    custom_fields?: { fileUrls?: string[]; referenceUrls?: string[] };
    assignee?: { name: string } | null;
    reviews?: { id: string; reviewer_type: string; rating: number; comment: string | null; reviewer_name: string | null; created_at: string }[];
    needs_help?: boolean;
    help_requested_at?: string | null;
    helper_count?: number;
    helpers?: { id: string; name: string; image: string | null }[];
    pending_reason?: string | null;
    pending_tag?: string | null;
    pended_at?: string | null;
    pended_from_status?: string | null;
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

const urgencyConfig: Record<string, { label: string; color: string; bg: string; style?: React.CSSProperties }> = {
    'P1': { label: 'P1', color: 'text-white', bg: 'bg-rose-500' },
    'P2': { label: 'P2', color: 'text-slate-900', bg: 'bg-orange-500' },
    'P3': { label: 'P3', color: 'text-slate-900', bg: 'bg-amber-500' },
    'P4': { label: 'P4', color: 'text-white', bg: 'bg-emerald-500' },
    '5-minute': { label: '5min', color: '', bg: '', style: { backgroundColor: '#56CDFC', color: '#ffffff' } },
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'todo': { label: 'New', color: 'text-sky-400', bg: 'bg-sky-500/20 border-sky-500/30' },
    'in-progress': { label: 'In Progress', color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/30' },
    'review': { label: 'In Review', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    'pending_completion_details': { label: 'Pending', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
    'pending': { label: 'On Hold', color: 'text-amber-600', bg: 'bg-amber-500/20 border-amber-500/30' },
    'done': { label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
    'archived': { label: 'Archived', color: 'text-slate-500', bg: 'bg-slate-500/20 border-slate-500/30' },
};

const DIVISIONS = [
    'All Divisions',
    'Factual Business Intelligence (FBI)',
    'Partner Relationship (PR)',
    'Marketplace (MP)',
    'Branding',
    'Finance',
    'Business Development (BD)',
    'Warehouse',
    'Human Resource (HR)',
    'Customer Service (CS)',
    'Logistics',
];

const ITEMS_PER_PAGE = 10;

function canEditCompletion(t: TicketRow, userId: string | undefined): boolean {
    // Only the original completer can edit, and only while the task is still
    // in Done status. No time-based edit window.
    if (!userId || t.status !== 'done') return false;
    return t.completed_by_id === userId;
}

function formatEditedFooter(editedAt: string | null | undefined): string {
    if (!editedAt) return '';
    return `Edited ${new Date(editedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })}`;
}

function NexusContent() {
    const searchParams = useSearchParams();
    const { user, profile, isLeader, isMaster } = useAuth();
    const draftTaskIds = useCommentDraftTaskIds();
    const [tickets, setTickets] = useState<TicketRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'queue' | 'direct'>('queue');
    const [directRequests, setDirectRequests] = useState<any[]>([]);
    const [directLoading, setDirectLoading] = useState(false);
    const [directPage, setDirectPage] = useState(1);
    const [viewDirectTicket, setViewDirectTicket] = useState<any | null>(null);
    const [directPriorityFilter, setDirectPriorityFilter] = useState('all');
    const [directSearchQuery, setDirectSearchQuery] = useState('');
    const [directStatusFilter, setDirectStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [divisionFilter, setDivisionFilter] = useState('All Divisions');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Route-to-Team triage (leader/admin only): which row's team picker is open
    // and the cached team list. Loaded once per session.
    const [routeMenuId, setRouteMenuId] = useState<string | null>(null);
    const [routingId, setRoutingId] = useState<string | null>(null);
    const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
    useEffect(() => {
        if (!isLeader) return;
        fetch('/api/teams').then(r => r.ok ? r.json() : []).then(setTeams).catch(() => {});
    }, [isLeader]);

    // View Modal
    const [viewTicket, setViewTicket] = useState<TicketRow | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [assignPickerOpen, setAssignPickerOpen] = useState(false);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [createTaskOpen, setCreateTaskOpen] = useState(false);

    // Comments
    const [taskComments, setTaskComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [commentSending, setCommentSending] = useState(false);
    const [forwardData, setForwardData] = useState<any | null>(null);

    // Mark-as-Pending modal — opened from the View Task modal. Free-text
    // reason + structured tag mirrors Cards Inbox so reporting can group
    // blockers across surfaces.
    const [pendingModalTask, setPendingModalTask] = useState<TicketRow | null>(null);
    const [pendingModalReason, setPendingModalReason] = useState('');
    const [pendingModalTag, setPendingModalTag] = useState<string>('waiting_on_brand');
    const [pendingModalSubmitting, setPendingModalSubmitting] = useState(false);
    const [pendingActionTaskId, setPendingActionTaskId] = useState<string | null>(null);

    const submitPendingTask = async () => {
        if (!pendingModalTask || !pendingModalReason.trim() || pendingModalSubmitting) return;
        setPendingModalSubmitting(true);
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
                alert(body?.error || 'Failed to mark task pending');
                return;
            }
            setPendingModalTask(null);
            setPendingModalReason('');
            await fetchTickets();
            // Reflect in the open modal so the user sees the new pending state
            // without re-opening the card.
            setViewTicket((prev) => prev && prev.id === pendingModalTask.id ? {
                ...prev,
                status: 'pending',
                pending_reason: pendingModalReason.trim(),
                pending_tag: pendingModalTag,
                pended_at: new Date().toISOString(),
                pended_from_status: prev.status,
            } : prev);
        } catch (err: any) {
            alert(err?.message || 'Failed to mark task pending');
        } finally {
            setPendingModalSubmitting(false);
        }
    };

    const handleResumeTask = async (ticket: TicketRow) => {
        if (pendingActionTaskId) return;
        setPendingActionTaskId(ticket.id);
        try {
            const res = await fetch(`/api/tasks/${ticket.id}/pending`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                alert(body?.error || 'Failed to resume task');
                return;
            }
            await fetchTickets();
            setViewTicket((prev) => prev && prev.id === ticket.id ? {
                ...prev,
                status: prev.pended_from_status || 'in-progress',
                pending_reason: null,
                pending_tag: null,
                pended_at: null,
                pended_from_status: null,
            } : prev);
        } catch (err: any) {
            alert(err?.message || 'Failed to resume task');
        } finally {
            setPendingActionTaskId(null);
        }
    };

    const fetchTaskComments = async (taskId: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/comments`);
            if (res.ok) setTaskComments(await res.json());
        } catch {}
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !viewTicket) return;
        setCommentSending(true);
        try {
            const res = await fetch(`/api/tasks/${viewTicket.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: commentText.trim() }),
            });
            if (res.ok) {
                setCommentText('');
                fetchTaskComments(viewTicket.id);
            }
        } catch {}
        setCommentSending(false);
    };

    // Leader Edit Mode
    const [isEditingView, setIsEditingView] = useState(false);
    const [editForm, setEditForm] = useState({ title: '', description: '', urgency: '', status: '', due_date: '', request_type: '' });
    const [saving, setSaving] = useState(false);

    // Complete Modal
    const [completeTicket, setCompleteTicket] = useState<TicketRow | null>(null);
    const [completeForm, setCompleteForm] = useState({
        completedAt: new Date().toISOString().slice(0, 16),
        completedBy: '',
        difficultyScore: 3,
        actualTimeSpent: '' as number | '',
        timeUnit: 'minutes',
        resolutionSummary: '',
    });
    const [completing, setCompleting] = useState(false);
    const [editingCompletion, setEditingCompletion] = useState(false);

    // Team members for "Completed By" dropdown
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);

    // Highlight from notification
    const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

    useEffect(() => {
        fetchTickets();
        fetchTeamMembers();
        if (isLeader) fetchDirectRequests();
    }, [isLeader]);

    // Auto-refresh the task list so incoming tasks show up without a manual reload:
    //   - Poll every 15s while the tab is visible
    //   - Refetch immediately when the tab regains focus
    // Silent refetch so the spinner doesn't flash.
    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (intervalId) return;
            intervalId = setInterval(() => {
                fetchTickets({ silent: true });
                if (isLeader) fetchDirectRequests();
            }, 15000);
        };
        const stop = () => {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchTickets({ silent: true });
                if (isLeader) fetchDirectRequests();
                start();
            } else {
                stop();
            }
        };

        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [isLeader]);

    // Handle highlight from notification query param
    useEffect(() => {
        const highlightId = searchParams.get('highlight');
        const highlightToken = searchParams.get('highlight_token');
        if (!tickets.length) return;

        let taskId = highlightId;
        if (!taskId && highlightToken) {
            const found = tickets.find(t => t.task_token === highlightToken);
            if (found) taskId = found.id;
        }

        if (taskId) {
            // Reset filters so the task is visible
            setStatusFilter('all');
            setPriorityFilter('all');
            setSearchQuery('');
            setDivisionFilter('All Divisions');
            setDateFrom('');
            setDateTo('');

            // Find which page the task is on (in default unfiltered list)
            const nonArchived = tickets.filter(t => t.status !== 'archived');
            const idx = nonArchived.findIndex(t => t.id === taskId);
            if (idx >= 0) {
                setCurrentPage(Math.floor(idx / ITEMS_PER_PAGE) + 1);
            }

            setHighlightedTaskId(taskId);

            const shouldOpen = searchParams.get('open') === 'true';
            const focusTarget = searchParams.get('focus');

            if (shouldOpen) {
                // Open the task detail popup
                const task = tickets.find(t => t.id === taskId);
                if (task) {
                    setViewTicket(task);
                    setTaskComments([]);
                    setCommentText('');
                    fetchTaskComments(task.id);

                    // Scroll to comments section inside the modal
                    if (focusTarget === 'comments') {
                        setTimeout(() => {
                            const commentsEl = document.getElementById('task-comments-section');
                            if (commentsEl) {
                                commentsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                commentsEl.classList.add('ring-2', 'ring-indigo-300', 'rounded-xl');
                                setTimeout(() => commentsEl.classList.remove('ring-2', 'ring-indigo-300', 'rounded-xl'), 3000);
                            }
                        }, 800);
                    }
                }
            } else {
                // Just highlight the row
                setTimeout(() => {
                    const el = document.getElementById(`task-row-${taskId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => setHighlightedTaskId(null), 3000);
                    }
                }, 500);
            }
        }
    }, [tickets, searchParams]);

    const fetchTickets = async (opts?: { silent?: boolean }) => {
        // Silent refreshes (polling, tab-focus) skip the loading spinner so the list doesn't flicker.
        if (!opts?.silent) setLoading(true);
        try {
            const res = await fetch('/api/nexus');
            if (res.ok) {
                setTickets(await res.json());
            }
        } catch (err) {
            console.error('Error fetching tickets:', err);
        }
        if (!opts?.silent) setLoading(false);
    };

    const fetchTeamMembers = async () => {
        try {
            const res = await fetch('/api/users');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const fetchDirectRequests = async () => {
        setDirectLoading(true);
        try {
            const res = await fetch('/api/tasks/direct-requests-all');
            if (res.ok) {
                setDirectRequests(await res.json());
            }
        } catch (err) {
            console.error('Error fetching direct requests:', err);
        }
        setDirectLoading(false);
    };

    const handleArchive = async (ticketId: string) => {
        try {
            const res = await fetch(`/api/tasks/${ticketId}/archive`, { method: 'PUT' });
            if (res.ok) {
                await fetchTickets();
                setStatusFilter('archived');
                setCurrentPage(1);
            }
        } catch (err) {
            console.error('Error archiving task:', err);
        }
    };

    const handleDelete = async (ticketId: string) => {
        try {
            const res = await fetch(`/api/tasks/${ticketId}`, { method: 'DELETE' });
            if (res.ok) {
                setDeleteConfirmId(null);
                await fetchTickets();
            } else {
                const body = await res.json().catch(() => ({}));
                console.error('Delete failed:', res.status, body);
            }
        } catch (err) {
            console.error('Error deleting task:', err);
        }
    };

    const handleRouteToTeam = async (ticketId: string, teamId: string) => {
        setRoutingId(ticketId);
        try {
            const res = await fetch(`/api/tasks/${ticketId}/route-team`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId }),
            });
            if (res.ok) {
                setRouteMenuId(null);
                await fetchTickets();
            } else {
                const body = await res.json().catch(() => ({}));
                console.error('Route failed:', res.status, body);
            }
        } catch (err) {
            console.error('Error routing task:', err);
        } finally {
            setRoutingId(null);
        }
    };

    const handleClaim = async (ticket: TicketRow) => {
        try {
            const res = await fetch(`/api/tasks/${ticket.id}/claim`, { method: 'POST' });
            if (res.ok) {
                await fetchTickets();
                setViewTicket(null);
            }
        } catch (err) {
            console.error('Error claiming task:', err);
        }
    };

    const handleAssign = async (ticket: TicketRow, userId: string) => {
        try {
            const res = await fetch(`/api/tasks/${ticket.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reassignTo: userId }),
            });
            if (res.ok) {
                await fetchTickets();
                setAssignPickerOpen(false);
                setViewTicket(null);
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Failed to assign task');
            }
        } catch (err) {
            console.error('Error assigning task:', err);
        }
    };

    // Filters
    // Default: hide archived unless explicitly filtering for them
    let preFiltered = statusFilter === 'archived'
        ? tickets.filter(t => t.status === 'archived')
        : tickets.filter(t => t.status !== 'archived');

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        preFiltered = preFiltered.filter(t =>
            t.title.toLowerCase().includes(q) ||
            t.task_token?.toLowerCase().includes(q) ||
            t.requester_name?.toLowerCase().includes(q)
        );
    }
    if (divisionFilter !== 'All Divisions') {
        preFiltered = preFiltered.filter(t => t.requester_division === divisionFilter);
    }
    if (dateFrom) {
        preFiltered = preFiltered.filter(t => new Date(t.created_at) >= new Date(dateFrom));
    }
    if (dateTo) {
        preFiltered = preFiltered.filter(t => new Date(t.created_at) <= new Date(dateTo + 'T23:59:59'));
    }
    if (statusFilter === 'all') {
        preFiltered = preFiltered.filter(t => t.status !== 'done');
    } else if (statusFilter === 'queue') {
        preFiltered = preFiltered.filter(t => t.status === 'todo');
    } else if (statusFilter === 'in-progress') {
        preFiltered = preFiltered.filter(t => t.status === 'in-progress');
    } else if (statusFilter === 'pending') {
        preFiltered = preFiltered.filter(t => t.status === 'pending');
    } else if (statusFilter === 'completed-all') {
        preFiltered = preFiltered.filter(t => t.status === 'done');
    } else if (statusFilter === 'overdue') {
        // Pending tasks are paused — they're excluded from Overdue too.
        preFiltered = preFiltered.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'pending');
    }

    // Priority chip counts reflect the current status/division/date/search view —
    // completed tasks are already excluded in the default "all" tab.
    const priorityCountFor = (p: string) =>
        p === 'all' ? preFiltered.length : preFiltered.filter(t => t.urgency === p).length;

    const filteredUnsorted = priorityFilter === 'all'
        ? preFiltered
        : preFiltered.filter(t => t.urgency === priorityFilter);

    // Untouched-first ordering: rows with status "New" (todo) OR no assignee
    // ("Awaiting") bubble to the top so unclaimed work is the first thing seen.
    // Within each bucket, keep newest-first by created_at.
    const isUntouched = (t: typeof filteredUnsorted[number]) =>
        t.status === 'todo' || !t.assignee?.name;
    const filtered = [...filteredUnsorted].sort((a, b) => {
        const au = isUntouched(a) ? 0 : 1;
        const bu = isUntouched(b) ? 0 : 1;
        if (au !== bu) return au - bu;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // KPI counts. Pending tasks are excluded from In Progress and Overdue —
    // they're paused by definition, so the assignee shouldn't be flagged for
    // them and the In Progress count should reflect *active* work.
    const nonArchived = tickets.filter(t => t.status !== 'archived');
    const openCount = nonArchived.filter(t => t.status === 'todo').length;
    const inProgressCount = nonArchived.filter(t => t.status === 'in-progress').length;
    const pendingCount = nonArchived.filter(t => t.status === 'pending').length;
    const completedAllCount = nonArchived.filter(t => t.status === 'done').length;
    const overdueCount = nonArchived.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'pending').length;
    const archivedCount = tickets.filter(t => t.status === 'archived').length;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getDaysToDeadline = (dueDate: string | null) => {
        if (!dueDate) return null;
        return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    };
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // 24h "HH:MM" — matches Indonesian business convention.
    const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Leader edit handlers
    const openEditMode = () => {
        if (!viewTicket) return;
        setEditForm({
            title: viewTicket.title,
            description: viewTicket.description || '',
            urgency: viewTicket.urgency || 'P3',
            status: viewTicket.status,
            due_date: viewTicket.due_date ? viewTicket.due_date.slice(0, 10) : '',
            request_type: viewTicket.request_type || '',
        });
        setIsEditingView(true);
    };

    const handleSaveEdit = async () => {
        if (!viewTicket) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/tasks/${viewTicket.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                await fetchTickets();
                setViewTicket(null);
                setIsEditingView(false);
            }
        } catch (err) {
            console.error('Error saving task:', err);
        }
        setSaving(false);
    };

    const clearDateFilter = () => {
        setDateFrom('');
        setDateTo('');
        setCurrentPage(1);
    };

    const handleComplete = async () => {
        if (!completeTicket) return;
        setCompleting(true);
        try {
            const res = await fetch(`/api/tasks/${completeTicket.id}/complete`, {
                method: editingCompletion ? 'PATCH' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...completeForm,
                    actualTimeSpent: Number(completeForm.actualTimeSpent) || 0,
                }),
            });
            if (res.ok) {
                await fetchTickets();
                // Keep the View modal in sync with the new assessment so the
                // user sees their edits immediately on the underlying card.
                if (editingCompletion && viewTicket) {
                    setViewTicket({
                        ...viewTicket,
                        completed_at: completeForm.completedAt
                            ? new Date(completeForm.completedAt).toISOString()
                            : viewTicket.completed_at,
                        difficulty_score: completeForm.difficultyScore,
                        actual_time_spent: Number(completeForm.actualTimeSpent) || null,
                        time_unit: completeForm.timeUnit,
                        resolution_summary: completeForm.resolutionSummary || null,
                    });
                }
                setCompleteTicket(null);
                setEditingCompletion(false);
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Failed to save changes');
            }
        } catch (err) {
            console.error('Error completing task:', err);
        }
        setCompleting(false);
    };

    const openEditCompletion = (t: TicketRow) => {
        setCompleteForm({
            completedAt: t.completed_at
                ? new Date(t.completed_at).toISOString().slice(0, 16)
                : new Date().toISOString().slice(0, 16),
            completedBy: t.completed_by || '',
            difficultyScore: t.difficulty_score ?? 3,
            actualTimeSpent: t.actual_time_spent ?? '',
            timeUnit: t.time_unit || 'minutes',
            resolutionSummary: t.resolution_summary || '',
        });
        setEditingCompletion(true);
        setCompleteTicket(t);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <PageTabs tabs={[
                    { href: '/tasks', label: 'My Tasks' },
                    { href: '/nexus', label: 'Task Queue' },
                    { href: '/team-inbox', label: 'Cards Inbox' },
                    { href: '/orbit', label: 'AHA Orbit' },
                ]} />
                {isLeader && (
                    <button
                        onClick={() => setCreateTaskOpen(true)}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full shadow-sm transition-colors text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        {/* Hide the label on tiny screens — the icon alone is plenty since
                            "Create Task" is the only primary action in this row. */}
                        <span className="hidden sm:inline">Create Task</span>
                    </button>
                )}
            </div>

            {/* Tab Toggle (Leader/Admin only) */}
            {isLeader && (
                <div className="flex justify-center">
                    <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex gap-1">
                        <button
                            onClick={() => setActiveTab('queue')}
                            className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'queue' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Open Queue
                        </button>
                        <button
                            onClick={() => setActiveTab('direct')}
                            className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${activeTab === 'direct' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Direct Requests
                            {directRequests.filter(t => t.status === 'pending_approval').length > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                    {directRequests.filter(t => t.status === 'pending_approval').length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'queue' ? (
            <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 sm:gap-4">
                {[
                    { key: 'queue', label: 'List Queue Task', count: openCount, color: 'text-sky-400', icon: Inbox, ring: 'ring-sky-500/30' },
                    { key: 'in-progress', label: 'In Progress', count: inProgressCount, color: 'text-indigo-400', icon: Clock, ring: 'ring-indigo-500/30' },
                    { key: 'pending', label: 'Pending', count: pendingCount, color: 'text-amber-500', icon: PauseCircle, ring: 'ring-amber-500/30' },
                    { key: 'completed-all', label: 'Completed', count: completedAllCount, color: 'text-emerald-400', icon: CheckCircle2, ring: 'ring-emerald-500/30' },
                    { key: 'overdue', label: 'Overdue', count: overdueCount, color: 'text-rose-400', icon: AlertTriangle, ring: 'ring-rose-500/30' },
                    { key: 'archived', label: 'Archived', count: archivedCount, color: 'text-slate-500', icon: Archive, ring: 'ring-slate-500/30' },
                ].map(kpi => (
                    <button
                        key={kpi.key}
                        onClick={() => { setStatusFilter(statusFilter === kpi.key ? 'all' : kpi.key); setCurrentPage(1); }}
                        className={`bg-white shadow-sm border-slate-200 border rounded-2xl p-3 sm:p-5 text-left transition-all hover:bg-slate-50 ${
                            statusFilter === kpi.key ? `border-indigo-500/50 ring-2 ${kpi.ring}` : 'border-slate-200'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <kpi.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${kpi.color}`} />
                        </div>
                        <p className={`text-xl sm:text-3xl font-bold ${kpi.color}`}>{kpi.count}</p>
                        <p className="text-[11px] sm:text-sm text-slate-500 leading-tight">{kpi.label}</p>
                    </button>
                ))}
            </div>

            {/* Date Filter Row — wraps on mobile so the date inputs and division select
                don't horizontally overflow on narrow viewports. */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-3 shadow-sm">
                <span className="text-xs font-medium text-slate-500 w-full sm:w-auto">Date Range</span>
                <input
                    type="date" value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    className="flex-1 min-w-0 sm:flex-initial px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-xs hidden sm:inline">—</span>
                <input
                    type="date" value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                    className="flex-1 min-w-0 sm:flex-initial px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                {(dateFrom || dateTo) && (
                    <button
                        onClick={clearDateFilter}
                        className="px-3 py-1.5 text-xs font-medium text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    >
                        Clear
                    </button>
                )}
                <div className="w-full sm:w-auto sm:ml-auto">
                    <select
                        value={divisionFilter}
                        onChange={(e) => { setDivisionFilter(e.target.value); setCurrentPage(1); }}
                        className="w-full sm:w-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    >
                        {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>

            {/* Filter Bar — BigSeller-style chip row */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2">
                <FilterChips
                    label="Priority"
                    value={priorityFilter}
                    onChange={(v) => { setPriorityFilter(v); setCurrentPage(1); }}
                    options={['all', 'P1', 'P2', 'P3', 'P4', '5-minute'].map(p => ({
                        value: p,
                        label: p === 'all' ? 'All' : urgencyConfig[p]?.label || p,
                        count: priorityCountFor(p),
                    }))}
                />
                <div className="flex items-start gap-4 py-2 border-t border-slate-100">
                    <div className="shrink-0 pt-1.5 w-24 text-sm text-slate-500">Search</div>
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search tasks..."
                            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="text-center py-16">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Loading tasks...</p>
                </div>
            ) : paged.length === 0 ? (
                <div className="text-center py-16 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl">
                    <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">No tasks found</p>
                </div>
            ) : (
                <>
                {/* Mobile (below md) — stacked cards, click opens the same view modal. */}
                <ul className="md:hidden space-y-2.5">
                    {paged.map(ticket => {
                        const urgency = urgencyConfig[ticket.urgency || 'P3'];
                        const status = statusConfig[ticket.status] || statusConfig['todo'];
                        const openViewModal = () => { setViewTicket(ticket); setTaskComments([]); setCommentText(''); fetchTaskComments(ticket.id); };
                        return (
                            <li key={ticket.id} id={`task-row-${ticket.id}-m`}>
                                <button
                                    type="button"
                                    onClick={openViewModal}
                                    className={`w-full text-left bg-white border rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors ${
                                        highlightedTaskId === ticket.id
                                            ? 'border-indigo-300 ring-2 ring-indigo-200'
                                            : ticket.needs_help
                                                ? 'border-amber-300 border-l-4'
                                                : 'border-slate-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${urgency?.bg || 'bg-slate-200'} ${urgency?.color || 'text-slate-900'}`} style={urgency?.style}>{urgency?.label || '—'}</span>
                                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border ${status.bg} ${status.color}`}>{status.label}</span>
                                        {/* "Help wanted" pill — flags rows that surfaced into Open Queue
                                            via the needs_help broadcast (not claimable, helpers welcome). */}
                                        {ticket.needs_help && (
                                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500 text-white">
                                                🙋 Help wanted
                                            </span>
                                        )}
                                        <span className="ml-auto font-mono text-[11px] text-indigo-500">{ticket.task_token || '—'}</span>
                                    </div>
                                    <p className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words flex items-start gap-1.5 flex-wrap">
                                        {ticket.needs_help && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full">🙋</span>}
                                        {draftTaskIds.has(ticket.id) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full">✏️ Draft</span>}
                                        <span className="break-words">{ticket.title}</span>
                                    </p>
                                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                                        <div>
                                            <dt className="text-slate-400">Requester</dt>
                                            <dd className="text-slate-700 font-medium truncate">{ticket.requester_name || '—'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-slate-400">Assigned to</dt>
                                            <dd className="text-slate-700 font-medium truncate">
                                                {ticket.assignee?.name
                                                    ? <>{ticket.assignee.name}{(ticket.helpers?.length ?? 0) > 0 && <span className="text-slate-400 font-normal"> +{ticket.helpers!.length}</span>}</>
                                                    : <span className="italic text-amber-600">Awaiting</span>}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-slate-400">Submitted</dt>
                                            <dd className="text-slate-700">{formatDate(ticket.created_at)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-slate-400">Deadline</dt>
                                            <dd className="text-slate-700">
                                                {ticket.status === 'done' ? <span className="text-emerald-500 font-medium">✓ Done</span>
                                                    : !ticket.due_date ? <span className="text-slate-400">—</span>
                                                    : <DueCountdown dueDate={ticket.due_date} />}
                                            </dd>
                                        </div>
                                        {isLeader && (
                                            <div className="col-span-2">
                                                <dt className="text-slate-400">Team</dt>
                                                <dd className="text-slate-700">
                                                    {ticket.assigned_team
                                                        ? <span className="inline-flex items-center text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-1.5 py-0.5">{ticket.assigned_team.name}</span>
                                                        : <span className="italic text-slate-400">Unassigned</span>}
                                                </dd>
                                            </div>
                                        )}
                                    </dl>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {/* Desktop / tablet — keep the dense table. */}
                <div className="hidden md:block bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-max min-w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Token</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Priority</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Title</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Requester</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Submitted</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Deadline</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Status</th>
                                    {isLeader && <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Team</th>}
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Assigned To</th>
                                    {isLeader && <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase whitespace-nowrap">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {paged.map(ticket => {
                                    const urgency = urgencyConfig[ticket.urgency || 'P3'];
                                    const status = statusConfig[ticket.status] || statusConfig['todo'];
                                    const daysToDeadline = getDaysToDeadline(ticket.due_date);
                                    const isOverdue = daysToDeadline !== null && daysToDeadline < 0 && ticket.status !== 'done';

                                    const openViewModal = () => { setViewTicket(ticket); setTaskComments([]); setCommentText(''); fetchTaskComments(ticket.id); };
                                    return (
                                        <tr
                                            key={ticket.id}
                                            id={`task-row-${ticket.id}`}
                                            onClick={openViewModal}
                                            className={`cursor-pointer transition-all duration-500 ${
                                                highlightedTaskId === ticket.id
                                                    ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-inset'
                                                    : ticket.needs_help
                                                        ? 'bg-amber-50/60 hover:bg-amber-50 border-l-4 border-l-amber-400'
                                                        : 'hover:bg-slate-100/30'
                                            }`}
                                        >
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-sm text-indigo-400">{ticket.task_token || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${urgency?.bg || 'bg-slate-700'} ${urgency?.color || 'text-slate-900'}`}
                                                    style={urgency?.style}
                                                >
                                                    {urgency?.label || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm text-slate-900 font-medium truncate max-w-[250px] flex items-center gap-1.5">
                                                    {ticket.needs_help && (
                                                        <span title="Help requested" className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full">
                                                            🙋
                                                        </span>
                                                    )}
                                                    {draftTaskIds.has(ticket.id) && (
                                                        <span title="You have an unsent comment draft" className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full">
                                                            ✏️ Draft
                                                        </span>
                                                    )}
                                                    <span className="truncate">{ticket.title}</span>
                                                </p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm text-slate-600">{ticket.requester_name || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col leading-tight">
                                                    <span className="text-sm text-slate-700">{formatDate(ticket.created_at)}</span>
                                                    <span className="text-[11px] text-slate-400">{formatTime(ticket.created_at)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {ticket.status === 'done' ? (
                                                    <span className="text-sm font-medium text-emerald-500">✓</span>
                                                ) : !ticket.due_date ? (
                                                    <span className="text-sm text-slate-400">—</span>
                                                ) : (
                                                    <DueCountdown dueDate={ticket.due_date} />
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${status.bg} ${status.color}`}>
                                                    {status.label}
                                                </span>
                                                {/* "Help wanted" pill — distinguishes help-flagged rows
                                                    surfaced via needs_help (not claimable, helpers welcome). */}
                                                {ticket.needs_help && (
                                                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                                                        🙋 Help wanted
                                                    </span>
                                                )}
                                            </td>
                                            {isLeader && (
                                                <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                                                    {ticket.assigned_team ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5">
                                                            {ticket.assigned_team.name}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => setRouteMenuId(routeMenuId === ticket.id ? null : ticket.id)}
                                                                disabled={routingId === ticket.id}
                                                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 transition-colors disabled:opacity-50"
                                                            >
                                                                {routingId === ticket.id ? 'Routing…' : 'Route to team'}
                                                            </button>
                                                            {routeMenuId === ticket.id && teams.length > 0 && (
                                                                <div className="absolute z-30 top-full mt-1 left-0 w-56 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                                                    {teams.map(t => (
                                                                        <button
                                                                            key={t.id}
                                                                            type="button"
                                                                            onClick={() => handleRouteToTeam(ticket.id, t.id)}
                                                                            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-indigo-50"
                                                                        >
                                                                            {t.name}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-4 py-3">
                                                {ticket.assignee?.name ? (
                                                    <span className="text-sm font-medium text-slate-700">
                                                        {ticket.assignee.name}
                                                        {(ticket.helpers?.length ?? 0) > 0 && (
                                                            <span className="text-slate-500">, {ticket.helpers!.map(h => h.name).join(', ')}</span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm italic font-medium text-amber-600">Awaiting</span>
                                                )}
                                            </td>
                                            {isLeader && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {isLeader && ticket.status === 'done' && (
                                                        <button
                                                            onClick={() => handleArchive(ticket.id)}
                                                            className="px-4 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-sm transition-all"
                                                        >
                                                            Archive
                                                        </button>
                                                    )}
                                                    {isLeader && deleteConfirmId === ticket.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleDelete(ticket.id)}
                                                                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-full shadow-sm transition-all"
                                                            >
                                                                Confirm?
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirmId(null)}
                                                                className="px-4 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-sm transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : isLeader && (
                                                        <button
                                                            onClick={() => setDeleteConfirmId(ticket.id)}
                                                            className="px-4 py-2 text-xs font-bold text-rose-500 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 rounded-full shadow-sm transition-all"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-center gap-2 py-4 border-t border-slate-200">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                onClick={() => setCurrentPage(p)}
                                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                                    currentPage === p
                                        ? 'bg-indigo-500 text-white'
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                        {totalPages > 5 && <span className="text-slate-500">…</span>}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                </>
            )}


            <ForwardToChannelModal
                open={!!forwardData}
                onClose={() => setForwardData(null)}
                originalAuthor={forwardData?.originalAuthor || ''}
                originalContent={forwardData?.originalContent || ''}
                originalAttachments={forwardData?.originalAttachments || []}
                originalChannelName={forwardData?.originalChannelName}
                originalChannelId={forwardData?.originalChannelId}
                originalMessageId={forwardData?.originalMessageId}
                originalDate={forwardData?.originalDate}
                isTaskForward={forwardData?.isTaskForward}
                taskToken={forwardData?.taskToken}
                taskId={forwardData?.taskId}
            />

            {/* Mark-as-Pending modal — Task Queue surface. Layered above the
                view modal (z-[80]) so it's visible while the underlying task
                detail stays open behind it. */}
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
                                onClick={submitPendingTask}
                                disabled={!pendingModalReason.trim() || pendingModalSubmitting}
                                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {pendingModalSubmitting ? 'Pausing…' : (<><PauseCircle className="w-3.5 h-3.5" /> Pause task</>)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Task Modal */}
            {completeTicket && (
                <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl h-full max-h-screen sm:h-auto sm:max-h-[85vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-900">
                                    {editingCompletion ? 'Edit Task Completion Assessment' : 'Complete This Task'}
                                </h2>
                                <button onClick={() => { setCompleteTicket(null); setEditingCompletion(false); }} className="p-1 text-slate-500 hover:text-slate-900">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            {/* Task Summary Card */}
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl text-sm">
                                <div className="grid grid-cols-3 gap-2">
                                    <div><p className="text-slate-500 text-xs">Token</p><p className="text-indigo-400 font-mono">{completeTicket.task_token}</p></div>
                                    <div><p className="text-slate-500 text-xs">Requester</p><p className="text-slate-900">{completeTicket.requester_name}</p></div>
                                    <div><p className="text-slate-500 text-xs">Priority</p><p className="text-slate-900">{completeTicket.urgency}</p></div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Completion Date & Time + Completed By — only when first marking complete.
                                During edit, both are immutable (server enforces completer-only and
                                preserves the original completion timestamp), so we hide the inputs
                                entirely instead of showing disabled controls. */}
                            {!editingCompletion && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-sm text-slate-500 font-medium">Completion Date & Time</label>
                                        <input
                                            type="datetime-local"
                                            value={completeForm.completedAt}
                                            onChange={(e) => setCompleteForm({ ...completeForm, completedAt: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm text-slate-500 font-medium">Completed By</label>
                                        <select
                                            value={completeForm.completedBy}
                                            onChange={(e) => setCompleteForm({ ...completeForm, completedBy: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                        >
                                            <option value="">Select team member</option>
                                            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* Difficulty Score */}
                            <div className="space-y-2">
                                <label className="text-sm text-slate-500 font-medium">Difficulty Score</label>
                                <div className="flex gap-2">
                                    {[
                                        { val: 1, label: 'Trivial' },
                                        { val: 2, label: 'Easy' },
                                        { val: 3, label: 'Medium' },
                                        { val: 4, label: 'Hard' },
                                        { val: 5, label: 'Complex' },
                                    ].map(d => (
                                        <button
                                            key={d.val}
                                            type="button"
                                            onClick={() => setCompleteForm({ ...completeForm, difficultyScore: d.val })}
                                            className={`flex-1 py-2.5 rounded-xl text-center text-sm font-medium border transition-all ${
                                                completeForm.difficultyScore === d.val
                                                    ? 'bg-indigo-500 text-white border-indigo-500'
                                                    : 'bg-slate-50 text-slate-500 border-slate-300 hover:text-slate-900'
                                            }`}
                                        >
                                            <div className="text-lg font-bold">{d.val}</div>
                                            <div className="text-xs mt-0.5">{d.label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Time Spent */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Actual Time Spent</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={completeForm.actualTimeSpent}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setCompleteForm({
                                                ...completeForm,
                                                actualTimeSpent: v === '' ? '' : Number(v),
                                            });
                                        }}
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-slate-500">Unit</span>
                                        <button
                                            type="button"
                                            onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'minutes' })}
                                            className={`px-3 py-1.5 rounded-lg ${completeForm.timeUnit === 'minutes' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            Minutes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'hours' })}
                                            className={`px-3 py-1.5 rounded-lg ${completeForm.timeUnit === 'hours' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            Hours
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Resolution Summary */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Resolution Summary</label>
                                <textarea
                                    value={completeForm.resolutionSummary}
                                    onChange={(e) => setCompleteForm({ ...completeForm, resolutionSummary: e.target.value })}
                                    rows={3}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                    placeholder="What was done to resolve this task?"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleComplete}
                                disabled={completing}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                {completing ? (editingCompletion ? 'Saving...' : 'Completing...') : (
                                    editingCompletion
                                        ? (<><Pencil className="w-5 h-5" /> Save Changes</>)
                                        : (<><CheckCircle2 className="w-5 h-5" /> Mark as Completed</>)
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>
            ) : (
            /* ─── Direct Requests Tab ──────────────────────────────────────── */
            <div className="space-y-4">
                {/* Direct Request KPI */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
                    {[
                        { key: 'pending_approval', label: 'Pending Approval', count: directRequests.filter(t => t.status === 'pending_approval').length, color: 'text-amber-500', bg: 'bg-amber-50', ring: 'ring-amber-500/30' },
                        { key: 'in-progress', label: 'In Progress', count: directRequests.filter(t => t.status === 'in-progress').length, color: 'text-indigo-500', bg: 'bg-indigo-50', ring: 'ring-indigo-500/30' },
                        { key: 'done', label: 'Completed', count: directRequests.filter(t => t.status === 'done').length, color: 'text-emerald-500', bg: 'bg-emerald-50', ring: 'ring-emerald-500/30' },
                        { key: 'archived', label: 'Archived', count: directRequests.filter(t => t.status === 'archived').length, color: 'text-slate-500', bg: 'bg-slate-50', ring: 'ring-slate-500/30' },
                        { key: 'all', label: 'Total', count: directRequests.length, color: 'text-slate-600', bg: 'bg-slate-50', ring: 'ring-slate-500/30' },
                    ].map(kpi => (
                        <button
                            key={kpi.key}
                            onClick={() => { setDirectStatusFilter(directStatusFilter === kpi.key ? 'all' : kpi.key); setDirectPage(1); }}
                            className={`${kpi.bg} border border-slate-200 rounded-2xl p-3 sm:p-5 text-left transition-all hover:shadow-sm ${
                                directStatusFilter === kpi.key ? `ring-2 ${kpi.ring}` : ''
                            }`}
                        >
                            <p className={`text-xl sm:text-3xl font-bold ${kpi.color}`}>{kpi.count}</p>
                            <p className="text-[11px] sm:text-sm text-slate-500 leading-tight">{kpi.label}</p>
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                        {['all', 'P1', 'P2', 'P3', 'P4', '5-minute'].map(p => (
                            <button
                                key={p}
                                onClick={() => { setDirectPriorityFilter(p); setDirectPage(1); }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
                                    directPriorityFilter === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                            >
                                {p === 'all' ? 'All' : p === '5-minute' ? '5min' : p}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={directSearchQuery}
                            onChange={e => { setDirectSearchQuery(e.target.value); setDirectPage(1); }}
                            placeholder="Search direct requests..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Direct Requests Table */}
                {directLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (() => {
                    let filteredDirect = directRequests;
                    if (directStatusFilter !== 'all') filteredDirect = filteredDirect.filter(t => t.status === directStatusFilter);
                    if (directPriorityFilter !== 'all') filteredDirect = filteredDirect.filter(t => t.urgency === directPriorityFilter);
                    if (directSearchQuery) filteredDirect = filteredDirect.filter(t => t.title.toLowerCase().includes(directSearchQuery.toLowerCase()) || (t.requester_name || '').toLowerCase().includes(directSearchQuery.toLowerCase()));

                    return filteredDirect.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 bg-white border border-slate-200 rounded-2xl">
                        <Inbox className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                        <p className="text-lg font-medium">{directRequests.length === 0 ? 'No direct requests yet' : 'No matching requests'}</p>
                        <p className="text-sm mt-1">{directRequests.length === 0 ? 'Direct requests from other teams will appear here.' : 'Try adjusting your filters.'}</p>
                    </div>
                ) : (
                    <>
                    {/* Shared row computer — used by the desktop table and the mobile card list. */}
                    {(() => {
                        const urgConfig: Record<string, { label: string; bg: string; text: string }> = {
                            'P1': { label: 'P1', bg: 'bg-rose-500', text: 'text-white' },
                            'P2': { label: 'P2', bg: 'bg-orange-500', text: 'text-white' },
                            'P3': { label: 'P3', bg: 'bg-amber-500', text: 'text-white' },
                            'P4': { label: 'P4', bg: 'bg-emerald-500', text: 'text-white' },
                            '5-minute': { label: '5min', bg: 'bg-sky-400', text: 'text-white' },
                        };
                        const statusConfig: Record<string, { label: string; color: string }> = {
                            'pending_approval': { label: 'Pending Approval', color: 'text-amber-600 bg-amber-50 border-amber-200' },
                            'in-progress': { label: 'In Progress', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
                            'todo': { label: 'Queue', color: 'text-slate-600 bg-slate-50 border-slate-200' },
                            'done': { label: 'Done', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                            'review': { label: 'Review', color: 'text-purple-600 bg-purple-50 border-purple-200' },
                        };
                        const pageItems = filteredDirect.slice((directPage - 1) * ITEMS_PER_PAGE, directPage * ITEMS_PER_PAGE);
                        const openTask = (task: any) => {
                            setViewTicket(task);
                            setTaskComments([]);
                            setCommentText('');
                            fetchTaskComments(task.id);
                        };
                        return (
                            <>
                                {/* ── Desktop / tablet (md+) — keep the dense 8-column table ── */}
                                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                                                <th className="px-5 py-3">Token</th>
                                                <th className="px-5 py-3">Priority</th>
                                                <th className="px-5 py-3">Title</th>
                                                <th className="px-5 py-3">Requester</th>
                                                <th className="px-5 py-3">Assigned To</th>
                                                <th className="px-5 py-3">Submitted</th>
                                                <th className="px-5 py-3">Deadline</th>
                                                <th className="px-5 py-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {pageItems.map(task => {
                                                const urg = urgConfig[task.urgency || ''] || { label: task.urgency || '—', bg: 'bg-slate-200', text: 'text-slate-600' };
                                                const st = statusConfig[task.status] || { label: task.status, color: 'text-slate-600 bg-slate-50 border-slate-200' };
                                                return (
                                                    <tr
                                                        key={task.id}
                                                        onClick={() => openTask(task)}
                                                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                                                    >
                                                        <td className="px-5 py-3 font-mono text-xs text-indigo-600">{task.task_token?.slice(0, 8) || '—'}</td>
                                                        <td className="px-5 py-3">
                                                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${urg.bg} ${urg.text}`}>{urg.label}</span>
                                                        </td>
                                                        <td className="px-5 py-3 font-medium text-slate-800 max-w-[180px] truncate">{task.title}</td>
                                                        <td className="px-5 py-3 text-slate-600 text-xs">
                                                            {task.requester_name || '—'}
                                                            {task.requester_division && <span className="block text-slate-400">{task.requester_division}</span>}
                                                        </td>
                                                        <td className="px-5 py-3 text-slate-600 text-xs">
                                                            {task.status === 'pending_approval'
                                                                ? <span className="text-amber-600 font-medium">{task.direct_assignee_name || '—'} <span className="text-slate-400">(pending)</span></span>
                                                                : task.assignee_name || task.direct_assignee_name || '—'
                                                            }
                                                            {task.delegations.length > 0 && (
                                                                <span className="block text-[10px] text-purple-500 mt-0.5">
                                                                    Delegated {task.delegations.length}x
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-3 text-slate-500 text-xs">
                                                            {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </td>
                                                        <td className="px-5 py-3 text-xs">
                                                            {task.response_deadline && task.status === 'pending_approval'
                                                                ? <CountdownTimer deadline={task.response_deadline} compact />
                                                                : task.response_deadline
                                                                ? <span className="text-slate-400">{new Date(task.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                                : <span className="text-slate-400">—</span>
                                                            }
                                                        </td>
                                                        <td className="px-5 py-3">
                                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${st.color}`}>{st.label}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* ── Mobile (below md) — stacked cards. Same data, same click handler. ── */}
                                <div className="md:hidden space-y-2.5">
                                    {pageItems.map(task => {
                                        const urg = urgConfig[task.urgency || ''] || { label: task.urgency || '—', bg: 'bg-slate-200', text: 'text-slate-600' };
                                        const st = statusConfig[task.status] || { label: task.status, color: 'text-slate-600 bg-slate-50 border-slate-200' };
                                        return (
                                            <button
                                                key={task.id}
                                                type="button"
                                                onClick={() => openTask(task)}
                                                className="w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors"
                                            >
                                                {/* Top row: priority + status + token */}
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${urg.bg} ${urg.text}`}>{urg.label}</span>
                                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border ${st.color}`}>{st.label}</span>
                                                    <span className="ml-auto font-mono text-[11px] text-indigo-500">{task.task_token?.slice(0, 8) || '—'}</span>
                                                </div>

                                                {/* Title */}
                                                <p className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words">{task.title}</p>

                                                {/* Two-column meta grid */}
                                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                                                    <div>
                                                        <dt className="text-slate-400">Requester</dt>
                                                        <dd className="text-slate-700 font-medium truncate">{task.requester_name || '—'}</dd>
                                                        {task.requester_division && <dd className="text-slate-400 truncate">{task.requester_division}</dd>}
                                                    </div>
                                                    <div>
                                                        <dt className="text-slate-400">Assigned to</dt>
                                                        <dd className="text-slate-700 font-medium truncate">
                                                            {task.status === 'pending_approval'
                                                                ? <span className="text-amber-600">{task.direct_assignee_name || '—'} <span className="text-slate-400 font-normal">(pending)</span></span>
                                                                : task.assignee_name || task.direct_assignee_name || '—'
                                                            }
                                                        </dd>
                                                        {task.delegations.length > 0 && (
                                                            <dd className="text-purple-500">Delegated {task.delegations.length}×</dd>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <dt className="text-slate-400">Submitted</dt>
                                                        <dd className="text-slate-700">
                                                            {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-slate-400">Deadline</dt>
                                                        <dd className="text-slate-700">
                                                            {task.response_deadline && task.status === 'pending_approval'
                                                                ? <CountdownTimer deadline={task.response_deadline} compact />
                                                                : task.response_deadline
                                                                ? <span>{new Date(task.response_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                                : <span className="text-slate-400">—</span>
                                                            }
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}

                    {/* Pagination */}
                    {filteredDirect.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                            {Array.from({ length: Math.ceil(filteredDirect.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setDirectPage(p)}
                                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${p === directPage ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    )}
                    </>
                );
                })()}

                {/* View Direct Request Modal */}
                {viewDirectTicket && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setViewDirectTicket(null)}>
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                                <div>
                                    <p className="text-xs text-indigo-500 font-mono font-bold">{viewDirectTicket.task_token || ''}</p>
                                    <h3 className="text-lg font-semibold text-slate-900">{viewDirectTicket.title}</h3>
                                </div>
                                <button onClick={() => setViewDirectTicket(null)} className="p-1 text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div><p className="text-slate-400 text-xs mb-0.5">Requester</p><p className="text-slate-800 font-medium">{viewDirectTicket.requester_name || '—'}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Division</p><p className="text-slate-800">{viewDirectTicket.requester_division || '—'}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Priority</p><p className="text-slate-800 font-semibold">{viewDirectTicket.urgency || '—'}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Status</p><p className="text-slate-800 capitalize">{viewDirectTicket.status?.replace('_', ' ')}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Assigned To</p><p className="text-slate-800">{viewDirectTicket.assignee_name || viewDirectTicket.direct_assignee_name || '—'}</p></div>
                                    <div><p className="text-slate-400 text-xs mb-0.5">Submitted</p><p className="text-slate-800">{new Date(viewDirectTicket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, {formatTime(viewDirectTicket.created_at)}</p></div>
                                    {viewDirectTicket.completed_by && <div><p className="text-slate-400 text-xs mb-0.5">Completed By</p><p className="text-slate-800">{viewDirectTicket.completed_by}</p></div>}
                                    {viewDirectTicket.completed_at && <div><p className="text-slate-400 text-xs mb-0.5">Completed At</p><p className="text-slate-800">{new Date(viewDirectTicket.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></div>}
                                </div>
                                {viewDirectTicket.description && (
                                    <div>
                                        <p className="text-slate-400 text-xs mb-1">Description</p>
                                        <div
                                            className="text-slate-600 text-sm bg-slate-50 rounded-xl p-3 whitespace-pre-wrap [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded"
                                            dangerouslySetInnerHTML={{ __html: viewDirectTicket.description }}
                                        />
                                    </div>
                                )}
                                {viewDirectTicket.attachment_link && (
                                    <div>
                                        <p className="text-slate-400 text-xs mb-1">Attachment</p>
                                        <button
                                            type="button"
                                            onClick={() => setLightboxUrl(viewDirectTicket.attachment_link)}
                                            className="block w-full"
                                        >
                                            <img src={viewDirectTicket.attachment_link} alt="Attachment" className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-slate-50 hover:opacity-90 cursor-zoom-in" />
                                        </button>
                                    </div>
                                )}
                                {viewDirectTicket.delegations.length > 0 && (
                                    <div>
                                        <p className="text-slate-400 text-xs mb-2">Delegation History</p>
                                        <div className="space-y-2">
                                            {viewDirectTicket.delegations.map((d: any, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs bg-purple-50 rounded-lg p-2.5 border border-purple-100">
                                                    <span className="text-purple-600 font-medium">{d.from}</span>
                                                    <span className="text-slate-400">→</span>
                                                    <span className="text-purple-600 font-medium">{d.to}</span>
                                                    {d.reason && <span className="text-slate-500 ml-1">"{d.reason}"</span>}
                                                    <span className="text-slate-400 ml-auto">{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Archive & Delete Buttons */}
                            <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-200">
                                {viewDirectTicket.status !== 'archived' && (
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Archive this direct request?')) return;
                                            try {
                                                await fetch(`/api/tasks/${viewDirectTicket.id}/archive`, { method: 'PUT' });
                                                setViewDirectTicket(null);
                                                fetchDirectRequests();
                                            } catch {}
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                        <Archive className="w-3.5 h-3.5" />
                                        Archive
                                    </button>
                                )}
                                {isMaster && (
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Delete this direct request permanently?')) return;
                                            try {
                                                await fetch(`/api/tasks/${viewDirectTicket.id}`, { method: 'DELETE' });
                                                setViewDirectTicket(null);
                                                fetchDirectRequests();
                                            } catch {}
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* View Detail Modal */}
            {viewTicket && (
                <div
                    className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => { if (!isEditingView) { setViewTicket(null); } }}
                >
                    <div className="w-full max-w-2xl bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl h-full max-h-screen sm:h-auto sm:max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-base text-indigo-400">{viewTicket.task_token}</span>
                                    {viewTicket.task_token && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(viewTicket.task_token || '');
                                                    setCopiedToken(viewTicket.task_token);
                                                    setTimeout(() => setCopiedToken(null), 1500);
                                                } catch {}
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                            title="Copy token"
                                        >
                                            {copiedToken === viewTicket.task_token ? (
                                                <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copied</>
                                            ) : (
                                                <><FileText className="w-3 h-3" /> Copy</>
                                            )}
                                        </button>
                                    )}
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 mt-1">{isEditingView ? 'Edit Task' : viewTicket.title}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {viewTicket.claimed_at && (
                                    <ForwardTimer
                                        startAt={viewTicket.claimed_at}
                                        stopAt={viewTicket.completed_at}
                                        label={viewTicket.completed_at ? 'Total' : 'Since claim'}
                                    />
                                )}
                                <SaveTaskButton taskId={viewTicket.id} />
                                {isLeader && !isEditingView && (
                                    <button onClick={openEditMode} className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit">
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => { setViewTicket(null); setIsEditingView(false); }} className="p-1 text-slate-500 hover:text-slate-900">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 space-y-5 text-base">
                            {isEditingView ? (
                                /* Leader Edit Form */
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium">Title</label>
                                        <input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium">Description</label>
                                        <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} rows={3}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 font-medium">Priority</label>
                                            <select value={editForm.urgency} onChange={e => setEditForm({...editForm, urgency: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500">
                                                <option value="P1">P1 — Critical</option>
                                                <option value="P2">P2 — High</option>
                                                <option value="P3">P3 — Normal</option>
                                                <option value="P4">P4 — Low</option>
                                                <option value="5-minute">5 Min</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 font-medium">Status</label>
                                            <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500">
                                                <option value="todo">New</option>
                                                <option value="in-progress">In Progress</option>
                                                <option value="review">In Review</option>
                                                <option value="done">Done</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs text-slate-500 font-medium">Deadline</label>
                                        <input type="date" value={editForm.due_date} onChange={e => setEditForm({...editForm, due_date: e.target.value})}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500" />
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button onClick={() => setIsEditingView(false)}
                                            className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                                        <button onClick={handleSaveEdit} disabled={saving}
                                            className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2">
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Requester</p><p className="text-base text-slate-900 font-medium">{viewTicket.requester_name || '—'}</p></div>
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Division</p><p className="text-base text-slate-900 font-medium">{viewTicket.requester_division || '—'}</p></div>
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Priority</p><p className="text-base text-slate-900 font-medium">{viewTicket.urgency || '—'}</p></div>
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Status</p><p className="text-base text-slate-900 font-medium capitalize">{statusConfig[viewTicket.status]?.label || viewTicket.status}</p></div>
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Assigned To</p><p className="text-base text-slate-900 font-medium">{viewTicket.assignee?.name || 'Unassigned'}</p></div>
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Submitted</p><p className="text-base text-slate-900 font-medium">{formatDate(viewTicket.created_at)}, {formatTime(viewTicket.created_at)}</p></div>
                                        {viewTicket.due_date && <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Deadline</p><p className="text-base text-slate-900 font-medium">{formatDate(viewTicket.due_date)}</p></div>}
                                        {viewTicket.request_type && <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Type</p><p className="text-base text-slate-900 font-medium capitalize">{viewTicket.request_type.replace('_', ' ')}</p></div>}
                                    </div>
                                    {viewTicket.description && (
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 mb-1.5">Description</p>
                                            <div
                                                className="text-slate-600 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded"
                                                dangerouslySetInnerHTML={{ __html: viewTicket.description }}
                                            />
                                        </div>
                                    )}
                                    {viewTicket.image_url && (
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 mb-1.5">Attached Image</p>
                                            <button
                                                type="button"
                                                onClick={() => setLightboxUrl(viewTicket.image_url)}
                                                className="block w-full"
                                            >
                                                <img
                                                    src={viewTicket.image_url}
                                                    alt="Request attachment"
                                                    className="w-full max-h-64 object-contain rounded-xl border border-slate-300 bg-slate-50 hover:opacity-90 transition-opacity cursor-zoom-in"
                                                />
                                            </button>
                                        </div>
                                    )}

                                    {/* Attached Files */}
                                    {viewTicket.custom_fields?.fileUrls?.length > 0 && (
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 mb-1.5">Attached Files</p>
                                            <div className="space-y-1.5">
                                                {viewTicket.custom_fields.fileUrls.map((url: string, i: number) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                                                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                        <span className="truncate">{url.split('/').pop() || url}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Reference URLs */}
                                    {viewTicket.custom_fields?.referenceUrls?.length > 0 && (
                                        <div>
                                            <p className="text-sm font-medium text-indigo-600 mb-1.5">Reference Links</p>
                                            <div className="space-y-1.5">
                                                {viewTicket.custom_fields.referenceUrls.map((url: string, i: number) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-100 transition-colors">
                                                        <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                        <span className="truncate">{url}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Completion Assessment (shown when task is done) */}
                                    {viewTicket.status === 'done' && (
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4" /> Task Completion Assessment
                                                </p>
                                                {canEditCompletion(viewTicket, profile?.id) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditCompletion(viewTicket)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
                                                    >
                                                        <Pencil className="w-3 h-3" /> Edit
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div><p className="text-emerald-600 text-xs">Completed By</p><p className="text-slate-900 font-medium">{viewTicket.completed_by || '—'}</p></div>
                                                <div><p className="text-emerald-600 text-xs">Completed At</p><p className="text-slate-900 font-medium">{viewTicket.completed_at ? new Date(viewTicket.completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p></div>
                                                <div><p className="text-emerald-600 text-xs">Difficulty Score</p><p className="text-slate-900 font-medium">{viewTicket.difficulty_score != null ? `${viewTicket.difficulty_score} / 5` : '—'}</p></div>
                                                <div><p className="text-emerald-600 text-xs">Time Spent</p><p className="text-slate-900 font-medium">{viewTicket.actual_time_spent != null ? `${viewTicket.actual_time_spent} ${viewTicket.time_unit || 'minutes'}` : '—'}</p></div>
                                            </div>
                                            {viewTicket.resolution_summary && (
                                                <div>
                                                    <p className="text-emerald-600 text-xs mb-1">Resolution Summary</p>
                                                    <p className="text-slate-700 bg-white border border-emerald-200 rounded-lg p-3 text-sm">{viewTicket.resolution_summary}</p>
                                                </div>
                                            )}
                                            {viewTicket.custom_fields?.assessment_edited_at && (
                                                <p className="text-[11px] text-emerald-700/70 italic pt-1 border-t border-emerald-200">
                                                    {formatEditedFooter(viewTicket.custom_fields.assessment_edited_at as string)}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Resolution (only if not shown in assessment above) */}
                                    {viewTicket.resolution_summary && viewTicket.status !== 'done' && (
                                        <div><p className="text-slate-500 mb-1">Resolution</p><p className="text-slate-600 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">{viewTicket.resolution_summary}</p></div>
                                    )}

                                    {/* Reviews */}
                                    {viewTicket.reviews && viewTicket.reviews.length > 0 && (
                                        <div>
                                            <p className="text-slate-500 mb-2 font-semibold flex items-center gap-1.5">
                                                <Star className="w-4 h-4 text-amber-400" /> Reviews
                                            </p>
                                            <div className="space-y-2">
                                                {viewTicket.reviews.map(r => (
                                                    <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className="text-xs font-medium text-indigo-600">
                                                                {r.reviewer_type === 'requester' ? 'Requester Review' : 'Completer Review'}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400">
                                                                {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {[1, 2, 3, 4, 5].map(s => (
                                                                <span key={s} className={`text-lg ${s <= r.rating ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                                                            ))}
                                                            <span className="text-sm font-semibold text-slate-700 ml-1">{r.rating}/5</span>
                                                        </div>
                                                        {r.comment && <p className="text-sm text-slate-600 mt-1">{r.comment}</p>}
                                                        {r.reviewer_name && <p className="text-xs text-slate-400 mt-1.5">— {r.reviewer_name}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Comments */}
                                    <div id="task-comments-section" className="transition-all duration-500">
                                        <TaskCommentsSection
                                            key={viewTicket.id}
                                            taskId={viewTicket.id}
                                            currentUserId={profile?.id}
                                            size="compact"
                                        />
                                    </div>

                                    {/* Claim / Assign Task Buttons */}
                                    {viewTicket.status === 'todo' && !viewTicket.assignee_id && (
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => handleClaim(viewTicket)}
                                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                <UserPlus className="w-5 h-5" /> Claim This Task
                                            </button>
                                            {isLeader && (
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setAssignPickerOpen(v => !v)}
                                                        className="w-full py-2.5 bg-white hover:bg-slate-50 text-indigo-700 font-semibold rounded-full border border-indigo-300 transition-all flex items-center justify-center gap-2 text-sm"
                                                    >
                                                        <UserPlus className="w-4 h-4" /> Assign to Member
                                                    </button>
                                                    {assignPickerOpen && (
                                                        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                                            {teamMembers.length === 0 ? (
                                                                <p className="p-3 text-sm text-slate-500">No members</p>
                                                            ) : teamMembers.map(m => (
                                                                <button
                                                                    key={m.id}
                                                                    onClick={() => handleAssign(viewTicket, m.id)}
                                                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 transition-colors"
                                                                >
                                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-xs font-bold flex items-center justify-center">
                                                                        {m.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="text-sm text-slate-700">{m.name}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {viewTicket.assignee_id && viewTicket.status !== 'done' && (
                                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
                                            <p className="text-sm text-indigo-600">
                                                Assigned to <span className="font-semibold text-slate-900">{viewTicket.assignee?.name || 'Unknown'}</span>
                                                {(viewTicket.helpers?.length ?? 0) > 0 && (
                                                    <span className="text-slate-700">, {viewTicket.helpers!.map(h => h.name).join(', ')}</span>
                                                )}
                                            </p>
                                        </div>
                                    )}

                                    {/* Collaboration — Request to Help */}
                                    <TaskHelpPanel
                                        taskId={viewTicket.id}
                                        assigneeId={viewTicket.assignee_id}
                                        currentUserId={user?.id}
                                        needsHelp={!!viewTicket.needs_help}
                                        onTaskUpdated={async () => {
                                            // Refetch the list, then reconcile the modal's copy so the button state updates in place.
                                            try {
                                                const res = await fetch('/api/nexus');
                                                if (res.ok) {
                                                    const list: TicketRow[] = await res.json();
                                                    setTickets(list);
                                                    const fresh = list.find(t => t.id === viewTicket.id);
                                                    if (fresh) setViewTicket(fresh);
                                                }
                                            } catch {}
                                        }}
                                        hidden={viewTicket.status === 'done'}
                                    />

                                    {/* Pending state callout + Mark/Resume actions.
                                        Hidden once the task is Done — completed tasks aren't
                                        eligible for pause. Reason copy mirrors /track and
                                        Cards Inbox so the user sees the same words wherever
                                        they look at the task. */}
                                    {viewTicket.status === 'pending' && (viewTicket.pending_reason || viewTicket.pending_tag) && (
                                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                                            <p className="text-xs font-bold text-amber-900 inline-flex items-center gap-1.5">
                                                <PauseCircle className="w-3.5 h-3.5" />
                                                On hold
                                                {viewTicket.pending_tag && PENDING_TAG_LABEL[viewTicket.pending_tag]
                                                    ? ` — ${PENDING_TAG_LABEL[viewTicket.pending_tag]}`
                                                    : ''}
                                            </p>
                                            {viewTicket.pending_reason && (
                                                <p className="text-xs text-amber-800 mt-1 leading-relaxed whitespace-pre-wrap">
                                                    {viewTicket.pending_reason}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Pending action visibility — mirrors the server-side
                                        canManagePending check in /api/tasks/[id]/pending so
                                        users only see actions they're actually authorized for.
                                        Anyone else sees nothing here. */}
                                    {(() => {
                                        const myEmail = profile?.email?.toLowerCase();
                                        const requesterEmail = viewTicket.requester_email?.toLowerCase();
                                        const canManagePending =
                                            isLeader ||
                                            viewTicket.assignee_id === user?.id ||
                                            (!!myEmail && !!requesterEmail && myEmail === requesterEmail);
                                        if (!canManagePending) return null;
                                        if (viewTicket.status !== 'done' && viewTicket.status !== 'pending') {
                                            return (
                                                <button
                                                    onClick={() => {
                                                        setPendingModalTask(viewTicket);
                                                        setPendingModalReason('');
                                                        setPendingModalTag('waiting_on_brand');
                                                    }}
                                                    disabled={pendingActionTaskId === viewTicket.id}
                                                    className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium rounded-full border border-amber-300 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                                >
                                                    <PauseCircle className="w-4 h-4" /> Mark as Pending
                                                </button>
                                            );
                                        }
                                        if (viewTicket.status === 'pending') {
                                            return (
                                                <button
                                                    onClick={() => handleResumeTask(viewTicket)}
                                                    disabled={pendingActionTaskId === viewTicket.id}
                                                    className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-full border border-emerald-300 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" /> Resume Task
                                                </button>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Forward to Channel */}
                                    <button
                                        onClick={() => setForwardData({
                                            originalAuthor: viewTicket.requester_name || 'Requester',
                                            originalContent: `📋 Task: ${viewTicket.title}\nToken: ${viewTicket.task_token}\nRequester: ${viewTicket.requester_name || '—'} (${viewTicket.requester_division || '—'})\nPriority: ${viewTicket.urgency || 'P3'} | Status: ${viewTicket.status}${viewTicket.description ? '\n\n' + htmlToPlainText(viewTicket.description) : ''}`,
                                            originalAttachments: [],
                                            isTaskForward: true,
                                            taskToken: viewTicket.task_token,
                                            taskId: viewTicket.id,
                                        })}
                                        className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-600 font-medium rounded-full border border-slate-300 transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Forward className="w-4 h-4" /> Forward to Channel
                                    </button>

                                    {/* Archive / Delete — leader-only, mirror what the legacy
                                        Direct Request modal exposed so unifying modals doesn't
                                        regress those actions. */}
                                    {isLeader && viewTicket.status !== 'archived' && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!confirm('Archive this task?')) return;
                                                await handleArchive(viewTicket.id);
                                                setViewTicket(null);
                                            }}
                                            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-full border border-slate-300 transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Archive className="w-4 h-4" /> Archive
                                        </button>
                                    )}
                                    {isLeader && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!confirm('Delete this task permanently? This cannot be undone.')) return;
                                                await handleDelete(viewTicket.id);
                                                setViewTicket(null);
                                            }}
                                            className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-medium rounded-full border border-rose-200 transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Trash2 className="w-4 h-4" /> Delete
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Task Wizard (Leader only) — 3-step wizard mirroring Direct Assign UX */}
            <CreateTaskWizard
                open={createTaskOpen && isLeader}
                onClose={() => setCreateTaskOpen(false)}
                onSubmitted={() => { fetchTickets(); }}
            />

            {/* Image lightbox — closes on ESC (document-level listener) and backdrop click */}
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        </div>
    );
}

export default function NexusPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
            <NexusContent />
        </Suspense>
    );
}
