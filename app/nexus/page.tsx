'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

import {
    Inbox, Clock, CheckCircle2, AlertTriangle, Search,
    Eye, CheckSquare, ChevronLeft, ChevronRight, X,
    Timer, Star, FileText, UserPlus, Archive, Trash2, Edit3
} from 'lucide-react';

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
    assignee?: { name: string } | null;
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

export default function NexusPage() {
    const { profile, isLeader } = useAuth();
    const [tickets, setTickets] = useState<TicketRow[]>([]);
    const [loading, setLoading] = useState(true);
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
        actualTimeSpent: 0,
        timeUnit: 'minutes',
        resolutionSummary: '',
    });
    const [completing, setCompleting] = useState(false);

    // Team members for "Completed By" dropdown
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        fetchTickets();
        fetchTeamMembers();
    }, []);

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
    if (statusFilter === 'queue') {
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
                body: JSON.stringify(completeForm),
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
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Fast</h1>
                <p className="text-slate-500">All incoming requests and tasks from partner teams.</p>
            </div>

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
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Due Days</th>
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
                                        <tr key={ticket.id} className="hover:bg-slate-100/30 transition-colors">
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
                                                ) : daysToDeadline === null ? (
                                                    <span className="text-sm text-slate-400">—</span>
                                                ) : (
                                                    <>
                                                        <span className={`text-sm font-medium ${isOverdue ? 'text-rose-500' : daysToDeadline <= 1 ? 'text-amber-500' : 'text-slate-700'}`}>
                                                            {daysToDeadline}d
                                                        </span>
                                                        {isOverdue && (
                                                            <span className="ml-1.5 text-xs bg-rose-500/20 text-rose-500 px-1.5 py-0.5 rounded border border-rose-500/30">
                                                                Overdue
                                                            </span>
                                                        )}
                                                    </>
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
                                                        onClick={() => setViewTicket(ticket)}
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
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div>
                                <span className="font-mono text-sm text-indigo-400">{viewTicket.task_token}</span>
                                <h2 className="text-lg font-semibold text-slate-900 mt-1">{isEditingView ? 'Edit Task' : viewTicket.title}</h2>
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
                        <div className="p-6 space-y-4 text-sm">
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
                                        <div><p className="text-slate-500">Requester</p><p className="text-slate-900">{viewTicket.requester_name || '—'}</p></div>
                                        <div><p className="text-slate-500">Division</p><p className="text-slate-900">{viewTicket.requester_division || '—'}</p></div>
                                        <div><p className="text-slate-500">Priority</p><p className="text-slate-900">{viewTicket.urgency || '—'}</p></div>
                                        <div><p className="text-slate-500">Status</p><p className="text-slate-900 capitalize">{statusConfig[viewTicket.status]?.label || viewTicket.status}</p></div>
                                        <div><p className="text-slate-500">Assigned To</p><p className="text-slate-900">{viewTicket.assignee?.name || 'Unassigned'}</p></div>
                                        <div><p className="text-slate-500">Submitted</p><p className="text-slate-900">{formatDate(viewTicket.created_at)}</p></div>
                                        {viewTicket.due_date && <div><p className="text-slate-500">Deadline</p><p className="text-slate-900">{formatDate(viewTicket.due_date)}</p></div>}
                                        {viewTicket.request_type && <div><p className="text-slate-500">Type</p><p className="text-slate-900 capitalize">{viewTicket.request_type.replace('_', ' ')}</p></div>}
                                    </div>
                                    {viewTicket.description && (
                                        <div><p className="text-slate-500 mb-1">Description</p><p className="text-slate-600 bg-slate-50 rounded-xl p-3">{viewTicket.description}</p></div>
                                    )}
                                    {viewTicket.image_url && (
                                        <div>
                                            <p className="text-slate-500 mb-1">Attached Image</p>
                                            <a href={viewTicket.image_url} target="_blank" rel="noopener noreferrer">
                                                <img
                                                    src={viewTicket.image_url}
                                                    alt="Request attachment"
                                                    className="w-full max-h-64 object-contain rounded-xl border border-slate-300 bg-slate-50 hover:opacity-90 transition-opacity cursor-pointer"
                                                />
                                            </a>
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

                                    {/* Claim Task Button */}
                                    {viewTicket.status === 'todo' && !viewTicket.assignee_id && (
                                        <button
                                            onClick={() => handleClaim(viewTicket)}
                                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <UserPlus className="w-5 h-5" /> Claim This Task
                                        </button>
                                    )}
                                    {viewTicket.assignee_id && viewTicket.status !== 'done' && (
                                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center">
                                            <p className="text-sm text-indigo-600">Assigned to <span className="font-semibold text-slate-900">{viewTicket.assignee?.name || 'Unknown'}</span></p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Task Modal */}
            {completeTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
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
                                        value={completeForm.actualTimeSpent}
                                        onChange={(e) => setCompleteForm({ ...completeForm, actualTimeSpent: parseInt(e.target.value) || 0 })}
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
        </div>
    );
}
