'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { CountdownTimer } from '@/components/CountdownTimer';
import { DueCountdown } from '@/components/DueCountdown';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';

import {
    Inbox, Clock, CheckCircle2, AlertTriangle, Search,
    Eye, CheckSquare, ChevronLeft, ChevronRight, X,
    Timer, Star, FileText, UserPlus, Archive, Trash2, Edit3, ExternalLink, MessageSquare, Send, Forward, Plus,
} from 'lucide-react';
import { RichTextEditor } from '@/components/RichTextEditor';
import { PageTabs } from '@/components/PageTabs';

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
    created_at: string;
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
    image_url: string | null;
    custom_fields?: { fileUrls?: string[]; referenceUrls?: string[] };
    assignee?: { name: string } | null;
    reviews?: { id: string; reviewer_type: string; rating: number; comment: string | null; reviewer_name: string | null; created_at: string }[];
}

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

function NexusContent() {
    const searchParams = useSearchParams();
    const { profile, isLeader, isMaster } = useAuth();
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

    // View Modal
    const [viewTicket, setViewTicket] = useState<TicketRow | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [assignPickerOpen, setAssignPickerOpen] = useState(false);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [createTaskOpen, setCreateTaskOpen] = useState(false);
    const [createTaskForm, setCreateTaskForm] = useState({
        title: '',
        description: '',
        urgency: 'P3',
        assigneeId: '',
        dueDate: '',
        dueDateTime: '',
        requestType: 'internal',
        imageUrl: '' as string,
        fileUrls: [] as string[],
        referenceUrls: [] as string[],
    });
    const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
    const [createTaskError, setCreateTaskError] = useState('');
    const [createTaskUrlInput, setCreateTaskUrlInput] = useState('');
    const [createTaskUploading, setCreateTaskUploading] = useState(false);
    const createTaskFileRef = useRef<HTMLInputElement>(null);
    const createTaskImageRef = useRef<HTMLInputElement>(null);

    // Comments
    const [taskComments, setTaskComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [commentSending, setCommentSending] = useState(false);
    const [forwardData, setForwardData] = useState<any | null>(null);

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

    // Team members for "Completed By" dropdown
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);

    // Highlight from notification
    const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

    useEffect(() => {
        fetchTickets();
        fetchTeamMembers();
        if (isLeader) fetchDirectRequests();
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

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/nexus');
            if (res.ok) {
                setTickets(await res.json());
            }
        } catch (err) {
            console.error('Error fetching tickets:', err);
        }
        setLoading(false);
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

    const handleCreateTask = async () => {
        setCreateTaskError('');
        if (!createTaskForm.title.trim()) { setCreateTaskError('Title is required'); return; }
        if (!createTaskForm.assigneeId) { setCreateTaskError('Please select an assignee'); return; }
        setCreateTaskSubmitting(true);
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createTaskForm),
            });
            if (res.ok) {
                await fetchTickets();
                setCreateTaskOpen(false);
                setCreateTaskForm({ title: '', description: '', urgency: 'P3', assigneeId: '', dueDate: '', dueDateTime: '', requestType: 'internal', imageUrl: '', fileUrls: [], referenceUrls: [] });
                setCreateTaskUrlInput('');
            } else {
                const data = await res.json().catch(() => ({}));
                setCreateTaskError(data.error || 'Failed to create task');
            }
        } catch (err: any) {
            setCreateTaskError(err.message || 'Failed to create task');
        } finally {
            setCreateTaskSubmitting(false);
        }
    };

    const uploadForCreateTask = async (file: File, kind: 'image' | 'file') => {
        setCreateTaskUploading(true);
        setCreateTaskError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            if (kind === 'image') {
                setCreateTaskForm(f => ({ ...f, imageUrl: data.url }));
            } else {
                setCreateTaskForm(f => ({ ...f, fileUrls: [...f.fileUrls, data.url] }));
            }
        } catch (err: any) {
            setCreateTaskError(err.message || 'Upload failed');
        } finally {
            setCreateTaskUploading(false);
        }
    };

    const handleCreateTaskPaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) uploadForCreateTask(file, 'image');
                return;
            }
        }
    };

    // Filters
    // Default: hide archived unless explicitly filtering for them
    let filtered = statusFilter === 'archived'
        ? tickets.filter(t => t.status === 'archived')
        : tickets.filter(t => t.status !== 'archived');

    if (priorityFilter !== 'all') {
        filtered = filtered.filter(t => t.urgency === priorityFilter);
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
            t.title.toLowerCase().includes(q) ||
            t.task_token?.toLowerCase().includes(q) ||
            t.requester_name?.toLowerCase().includes(q)
        );
    }
    if (divisionFilter !== 'All Divisions') {
        filtered = filtered.filter(t => t.requester_division === divisionFilter);
    }
    if (dateFrom) {
        filtered = filtered.filter(t => new Date(t.created_at) >= new Date(dateFrom));
    }
    if (dateTo) {
        filtered = filtered.filter(t => new Date(t.created_at) <= new Date(dateTo + 'T23:59:59'));
    }
    if (statusFilter === 'all') {
        filtered = filtered.filter(t => t.status !== 'done');
    } else if (statusFilter === 'queue') {
        filtered = filtered.filter(t => t.status === 'todo');
    } else if (statusFilter === 'in-progress') {
        filtered = filtered.filter(t => t.status === 'in-progress');
    } else if (statusFilter === 'completed-all') {
        filtered = filtered.filter(t => t.status === 'done');
    } else if (statusFilter === 'overdue') {
        filtered = filtered.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done');
    }

    // KPI counts
    const nonArchived = tickets.filter(t => t.status !== 'archived');
    const openCount = nonArchived.filter(t => t.status === 'todo').length;
    const inProgressCount = nonArchived.filter(t => t.status === 'in-progress').length;
    const completedAllCount = nonArchived.filter(t => t.status === 'done').length;
    const overdueCount = nonArchived.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;
    const archivedCount = tickets.filter(t => t.status === 'archived').length;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getDaysToDeadline = (dueDate: string | null) => {
        if (!dueDate) return null;
        return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    };
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...completeForm,
                    actualTimeSpent: Number(completeForm.actualTimeSpent) || 0,
                }),
            });
            if (res.ok) {
                await fetchTickets();
                setCompleteTicket(null);
            }
        } catch (err) {
            console.error('Error completing task:', err);
        }
        setCompleting(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <PageTabs tabs={[
                    { href: '/tasks', label: 'My Tasks' },
                    { href: '/nexus', label: 'Task Queue' },
                ]} />
                {isLeader && (
                    <button
                        onClick={() => setCreateTaskOpen(true)}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full shadow-sm transition-colors text-sm"
                    >
                        <Plus className="w-4 h-4" /> Create Task
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
                            FAST Queue
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { key: 'queue', label: 'List Queue Task', count: openCount, color: 'text-sky-400', icon: Inbox, ring: 'ring-sky-500/30' },
                    { key: 'in-progress', label: 'In Progress', count: inProgressCount, color: 'text-indigo-400', icon: Clock, ring: 'ring-indigo-500/30' },
                    { key: 'completed-all', label: 'Completed', count: completedAllCount, color: 'text-emerald-400', icon: CheckCircle2, ring: 'ring-emerald-500/30' },
                    { key: 'overdue', label: 'Overdue', count: overdueCount, color: 'text-rose-400', icon: AlertTriangle, ring: 'ring-rose-500/30' },
                    { key: 'archived', label: 'Archived', count: archivedCount, color: 'text-slate-500', icon: Archive, ring: 'ring-slate-500/30' },
                ].map(kpi => (
                    <button
                        key={kpi.key}
                        onClick={() => { setStatusFilter(statusFilter === kpi.key ? 'all' : kpi.key); setCurrentPage(1); }}
                        className={`bg-white shadow-sm border-slate-200 border rounded-2xl p-5 text-left transition-all hover:bg-slate-50 ${
                            statusFilter === kpi.key ? `border-indigo-500/50 ring-2 ${kpi.ring}` : 'border-slate-200'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                        </div>
                        <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.count}</p>
                        <p className="text-sm text-slate-500">{kpi.label}</p>
                    </button>
                ))}
            </div>

            {/* Date Filter Row (top, Shopee-style) */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <span className="text-xs font-medium text-slate-500">Date Range</span>
                <input
                    type="date" value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-xs">—</span>
                <input
                    type="date" value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                />
                {(dateFrom || dateTo) && (
                    <button
                        onClick={clearDateFilter}
                        className="px-3 py-1.5 text-xs font-medium text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    >
                        Clear
                    </button>
                )}
                <div className="ml-auto">
                    <select
                        value={divisionFilter}
                        onChange={(e) => { setDivisionFilter(e.target.value); setCurrentPage(1); }}
                        className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    >
                        {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Priority Tabs */}
                {['all', 'P1', 'P2', 'P3', 'P4', '5-minute'].map(p => (
                    <button
                        key={p}
                        onClick={() => { setPriorityFilter(p); setCurrentPage(1); }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            priorityFilter === p
                                ? p === 'all' ? 'bg-indigo-500 text-white' : `${urgencyConfig[p]?.bg || 'bg-indigo-500'} text-white`
                                : 'bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        {p === 'all' ? 'All' : urgencyConfig[p]?.label || p}
                    </button>
                ))}

                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        placeholder="Search tasks..."
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
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
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Token</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Priority</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Title</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Requester</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Submitted</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Deadline</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Assigned To</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {paged.map(ticket => {
                                    const urgency = urgencyConfig[ticket.urgency || 'P3'];
                                    const status = statusConfig[ticket.status] || statusConfig['todo'];
                                    const daysToDeadline = getDaysToDeadline(ticket.due_date);
                                    const isOverdue = daysToDeadline !== null && daysToDeadline < 0 && ticket.status !== 'done';

                                    return (
                                        <tr key={ticket.id} id={`task-row-${ticket.id}`} className={`transition-all duration-500 ${highlightedTaskId === ticket.id ? 'bg-indigo-50 ring-2 ring-indigo-300 ring-inset' : 'hover:bg-slate-100/30'}`}>
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
                                                <p className="text-sm text-slate-900 font-medium truncate max-w-[250px]">{ticket.title}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm text-slate-600">{ticket.requester_name || '—'}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-slate-500">{formatDate(ticket.created_at)}</span>
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
                                            </td>
                                            <td className="px-4 py-3">
                                                {ticket.assignee?.name ? (
                                                    <span className="text-sm font-medium text-slate-700">{ticket.assignee.name}</span>
                                                ) : (
                                                    <span className="text-sm italic font-medium text-amber-600">Awaiting</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => { setViewTicket(ticket); setTaskComments([]); setCommentText(''); fetchTaskComments(ticket.id); }}
                                                        className="px-4 py-2 text-xs font-bold text-[#0F0E7F] bg-white border border-slate-200 hover:bg-slate-50 rounded-full shadow-sm transition-all"
                                                    >
                                                        View
                                                    </button>
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
                                            </td>
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
            )}

            {/* View Detail Modal */}
            {viewTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
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
                                        <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Submitted</p><p className="text-base text-slate-900 font-medium">{formatDate(viewTicket.created_at)}</p></div>
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
                                            <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" /> Task Completion Assessment
                                            </p>
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
                                        <p className="text-slate-500 mb-2 font-semibold flex items-center gap-1.5">
                                            <MessageSquare className="w-4 h-4 text-indigo-500" /> Comments
                                            {taskComments.length > 0 && <span className="text-xs text-slate-400">({taskComments.length})</span>}
                                        </p>
                                        {taskComments.length > 0 && (
                                            <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                                                {taskComments.map(c => (
                                                    <div key={c.id} className={`flex gap-2 ${c.is_team ? 'flex-row-reverse' : ''}`}>
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                                            c.is_team ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'
                                                        }`}>{c.author_name?.charAt(0)?.toUpperCase() || '?'}</div>
                                                        <div className={`max-w-[75%] ${c.is_team ? 'text-right' : ''}`}>
                                                            <div className={`inline-block rounded-2xl px-3 py-2 text-xs ${
                                                                c.is_team ? 'bg-indigo-50 border border-indigo-200 rounded-tr-sm' : 'bg-slate-50 border border-slate-200 rounded-tl-sm'
                                                            }`}>{c.message}</div>
                                                            <p className="text-[10px] text-slate-400 mt-0.5 px-1">
                                                                {c.is_team ? '🔹 ' + c.author_name : c.author_name} · {new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={commentText}
                                                onChange={e => setCommentText(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSendComment(); } }}
                                                placeholder="Write a comment..."
                                                disabled={commentSending}
                                                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                            <button
                                                onClick={handleSendComment}
                                                disabled={!commentText.trim() || commentSending}
                                                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
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
                                            <p className="text-sm text-indigo-600">Assigned to <span className="font-semibold text-slate-900">{viewTicket.assignee?.name || 'Unknown'}</span></p>
                                        </div>
                                    )}

                                    {/* Forward to Channel */}
                                    <button
                                        onClick={() => setForwardData({
                                            originalAuthor: viewTicket.requester_name || 'Requester',
                                            originalContent: `📋 Task: ${viewTicket.title}\nToken: ${viewTicket.task_token}\nRequester: ${viewTicket.requester_name || '—'} (${viewTicket.requester_division || '—'})\nPriority: ${viewTicket.urgency || 'P3'} | Status: ${viewTicket.status}${viewTicket.description ? '\n\n' + viewTicket.description : ''}`,
                                            originalAttachments: [],
                                            isTaskForward: true,
                                            taskToken: viewTicket.task_token,
                                        })}
                                        className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-600 font-medium rounded-full border border-slate-300 transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Forward className="w-4 h-4" /> Forward to Channel
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
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
            />

            {/* Complete Task Modal */}
            {completeTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-900">Complete This Task</h2>
                                <button onClick={() => setCompleteTicket(null)} className="p-1 text-slate-500 hover:text-slate-900">
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
                            {/* Completion Date & Time */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Completion Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={completeForm.completedAt}
                                    onChange={(e) => setCompleteForm({ ...completeForm, completedAt: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Completed By */}
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
                                {completing ? 'Completing...' : (
                                    <><CheckCircle2 className="w-5 h-5" /> Mark as Completed</>
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
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                            className={`${kpi.bg} border border-slate-200 rounded-2xl p-5 text-left transition-all hover:shadow-sm ${
                                directStatusFilter === kpi.key ? `ring-2 ${kpi.ring}` : ''
                            }`}
                        >
                            <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.count}</p>
                            <p className="text-sm text-slate-500">{kpi.label}</p>
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
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                                    <th className="px-5 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredDirect
                                    .slice((directPage - 1) * ITEMS_PER_PAGE, directPage * ITEMS_PER_PAGE)
                                    .map(task => {
                                    const urgConfig: Record<string, { label: string; bg: string; text: string }> = {
                                        'P1': { label: 'P1', bg: 'bg-rose-500', text: 'text-white' },
                                        'P2': { label: 'P2', bg: 'bg-orange-500', text: 'text-white' },
                                        'P3': { label: 'P3', bg: 'bg-amber-500', text: 'text-white' },
                                        'P4': { label: 'P4', bg: 'bg-emerald-500', text: 'text-white' },
                                        '5-minute': { label: '5min', bg: 'bg-sky-400', text: 'text-white' },
                                    };
                                    const urg = urgConfig[task.urgency || ''] || { label: task.urgency || '—', bg: 'bg-slate-200', text: 'text-slate-600' };
                                    const statusConfig: Record<string, { label: string; color: string }> = {
                                        'pending_approval': { label: 'Pending Approval', color: 'text-amber-600 bg-amber-50 border-amber-200' },
                                        'in-progress': { label: 'In Progress', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
                                        'todo': { label: 'Queue', color: 'text-slate-600 bg-slate-50 border-slate-200' },
                                        'done': { label: 'Done', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                                        'review': { label: 'Review', color: 'text-purple-600 bg-purple-50 border-purple-200' },
                                    };
                                    const st = statusConfig[task.status] || { label: task.status, color: 'text-slate-600 bg-slate-50 border-slate-200' };

                                    return (
                                        <tr key={task.id} className="hover:bg-slate-50 transition-colors">
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
                                            <td className="px-5 py-3">
                                                <button
                                                    onClick={() => setViewDirectTicket(task)}
                                                    className="px-3 py-1.5 text-xs font-medium border border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

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
                                    <div><p className="text-slate-400 text-xs mb-0.5">Submitted</p><p className="text-slate-800">{new Date(viewDirectTicket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
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

            {/* Create Task Modal (Leader only) */}
            {createTaskOpen && isLeader && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => !createTaskSubmitting && setCreateTaskOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">Create Task</h2>
                            <button
                                onClick={() => setCreateTaskOpen(false)}
                                disabled={createTaskSubmitting}
                                className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Title <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    value={createTaskForm.title}
                                    onChange={(e) => setCreateTaskForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="What needs to be done?"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Description</label>
                                <RichTextEditor
                                    value={createTaskForm.description}
                                    onChange={(html) => setCreateTaskForm(f => ({ ...f, description: html }))}
                                    placeholder="Add details, context, links..."
                                    minHeight="100px"
                                    maxHeight="240px"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-600">Priority</label>
                                    <select
                                        value={createTaskForm.urgency}
                                        onChange={(e) => setCreateTaskForm(f => ({ ...f, urgency: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="P1">P1 — Urgent</option>
                                        <option value="P2">P2 — High</option>
                                        <option value="P3">P3 — Normal</option>
                                        <option value="P4">P4 — Low</option>
                                        <option value="5-minute">5 Min — Quick</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-600">Assignee <span className="text-rose-500">*</span></label>
                                    <select
                                        value={createTaskForm.assigneeId}
                                        onChange={(e) => setCreateTaskForm(f => ({ ...f, assigneeId: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="">Select member...</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Due Date</label>
                                <input
                                    type="date"
                                    value={createTaskForm.dueDate}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) {
                                            const now = new Date();
                                            const hh = String(now.getHours()).padStart(2, '0');
                                            const mm = String(now.getMinutes()).padStart(2, '0');
                                            const ss = String(now.getSeconds()).padStart(2, '0');
                                            setCreateTaskForm(f => ({ ...f, dueDate: val, dueDateTime: `${hh}:${mm}:${ss}` }));
                                        } else {
                                            setCreateTaskForm(f => ({ ...f, dueDate: '', dueDateTime: '' }));
                                        }
                                    }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                                {createTaskForm.dueDate && createTaskForm.dueDateTime && (
                                    <p className="text-xs text-indigo-600 font-medium">
                                        Deadline: {(() => {
                                            const [y, m, d] = createTaskForm.dueDate.split('-');
                                            return `${d}/${m}/${y} ${createTaskForm.dueDateTime} WIB`;
                                        })()}
                                    </p>
                                )}
                            </div>

                            {/* Image */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Image <span className="text-slate-400 text-xs">(Optional)</span></label>
                                <input
                                    ref={createTaskImageRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) uploadForCreateTask(file, 'image');
                                        if (createTaskImageRef.current) createTaskImageRef.current.value = '';
                                    }}
                                />
                                {createTaskForm.imageUrl ? (
                                    <div className="relative inline-block">
                                        <img src={createTaskForm.imageUrl} alt="Preview" className="max-h-40 rounded-xl border border-slate-200" />
                                        <button
                                            type="button"
                                            onClick={() => setCreateTaskForm(f => ({ ...f, imageUrl: '' }))}
                                            className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full shadow-md hover:bg-rose-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onPaste={handleCreateTaskPaste}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const file = e.dataTransfer?.files?.[0];
                                            if (file && file.type.startsWith('image/')) uploadForCreateTask(file, 'image');
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        onClick={() => createTaskImageRef.current?.click()}
                                        tabIndex={0}
                                        className="border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 text-center text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition-colors"
                                    >
                                        <span className="font-semibold text-indigo-600">Paste (Ctrl+V)</span> or click to upload
                                    </div>
                                )}
                            </div>

                            {/* Files */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Files <span className="text-slate-400 text-xs">(Optional)</span></label>
                                {createTaskForm.fileUrls.length > 0 && (
                                    <div className="space-y-1.5">
                                        {createTaskForm.fileUrls.map((url, i) => (
                                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                                                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                <span className="truncate flex-1 text-slate-700">{url.split('/').pop() || url}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCreateTaskForm(f => ({ ...f, fileUrls: f.fileUrls.filter((_, idx) => idx !== i) }))}
                                                    className="text-rose-400 hover:text-rose-600"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <input
                                    ref={createTaskFileRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) uploadForCreateTask(file, 'file');
                                        if (createTaskFileRef.current) createTaskFileRef.current.value = '';
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => createTaskFileRef.current?.click()}
                                    className="w-full px-4 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-colors flex items-center justify-center gap-2"
                                >
                                    <FileText className="w-4 h-4" /> Upload file (PDF, DOC, XLS, etc.)
                                </button>
                            </div>

                            {/* URLs */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">URLs / Links <span className="text-slate-400 text-xs">(Optional)</span></label>
                                {createTaskForm.referenceUrls.length > 0 && (
                                    <div className="space-y-1.5">
                                        {createTaskForm.referenceUrls.map((url, i) => (
                                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                <a href={url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-indigo-600 hover:underline">{url}</a>
                                                <button
                                                    type="button"
                                                    onClick={() => setCreateTaskForm(f => ({ ...f, referenceUrls: f.referenceUrls.filter((_, idx) => idx !== i) }))}
                                                    className="text-rose-400 hover:text-rose-600"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        value={createTaskUrlInput}
                                        onChange={(e) => setCreateTaskUrlInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && createTaskUrlInput.trim()) {
                                                e.preventDefault();
                                                setCreateTaskForm(f => ({ ...f, referenceUrls: [...f.referenceUrls, createTaskUrlInput.trim()] }));
                                                setCreateTaskUrlInput('');
                                            }
                                        }}
                                        placeholder="https://example.com/reference"
                                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (createTaskUrlInput.trim()) {
                                                setCreateTaskForm(f => ({ ...f, referenceUrls: [...f.referenceUrls, createTaskUrlInput.trim()] }));
                                                setCreateTaskUrlInput('');
                                            }
                                        }}
                                        className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 flex-shrink-0"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {createTaskUploading && (
                                <p className="text-xs text-indigo-600 font-medium">Uploading...</p>
                            )}
                            {createTaskError && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm">
                                    {createTaskError}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={() => setCreateTaskOpen(false)}
                                disabled={createTaskSubmitting}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-full disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateTask}
                                disabled={createTaskSubmitting}
                                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-sm disabled:opacity-40 transition-colors"
                            >
                                {createTaskSubmitting ? 'Creating...' : 'Create & Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image lightbox */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
                    onClick={() => setLightboxUrl(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
                >
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="Preview"
                        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
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
