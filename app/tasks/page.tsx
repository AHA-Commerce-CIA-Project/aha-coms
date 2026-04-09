'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';

import {
    CheckCircle2, Clock, AlertCircle, Inbox, FileText,
    X, UserPlus, Eye, Star, Calendar as CalendarIcon, Plus,
    ChevronLeft, ChevronRight, Trash2, Pencil, Users, Bell, UserMinus
} from 'lucide-react';

interface ClaimedTask {
    id: string;
    title: string;
    description: string | null;
    status: string;
    urgency: string | null;
    task_token: string | null;
    requester_name: string | null;
    requester_division: string | null;
    assignee_id: string | null;
    created_at: string;
    due_date: string | null;
    request_type: string | null;
    assignee?: { name: string } | null;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'todo': { label: 'New', color: 'text-sky-400', bg: 'bg-sky-500/20 border-sky-500/30' },
    'in-progress': { label: 'In Progress', color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/30' },
    'review': { label: 'In Review', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    'done': { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
    'archived': { label: 'Archived', color: 'text-slate-500', bg: 'bg-slate-500/20 border-slate-500/30' },
};

const urgencyConfig: Record<string, { label: string; bg: string; style?: React.CSSProperties }> = {
    'P1': { label: 'P1', bg: 'bg-rose-500' },
    'P2': { label: 'P2', bg: 'bg-orange-500' },
    'P3': { label: 'P3', bg: 'bg-amber-500' },
    'P4': { label: 'P4', bg: 'bg-emerald-500' },
    '5-minute': { label: '5min', bg: '', style: { backgroundColor: '#56CDFC', color: '#ffffff' } },
};

function MyTasksContent() {
    const { user, profile } = useAuth();
    const {
        tasks,
        projects,
        viewMode,
        setViewMode,
        selectedProjectId,
        setSelectedProject
    } = useAppStore();

    const [claimedTasks, setClaimedTasks] = useState<ClaimedTask[]>([]);
    const [loadingClaimed, setLoadingClaimed] = useState(true);
    const [viewTask, setViewTask] = useState<ClaimedTask | null>(null);
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
    const [reassignTo, setReassignTo] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [showCompleteForm, setShowCompleteForm] = useState(false);
    const [completeForm, setCompleteForm] = useState({
        completedAt: new Date().toISOString().slice(0, 16),
        completedBy: '',
        difficultyScore: 3,
        actualTimeSpent: 0,
        timeUnit: 'minutes',
        resolutionSummary: '',
    });

    useEffect(() => {
        if (user) {
            fetchClaimedTasks();
            fetchTeamMembers();
        }
    }, [user]);

    const getAuthHeaders = async () => {
        return {} as Record<string, string>;
    };

    const fetchClaimedTasks = async () => {
        setLoadingClaimed(true);
        try {
            const res = await fetch('/api/nexus');
            if (res.ok) {
                const all = await res.json();
                const mine = all.filter((t: any) => t.assignee_id === user?.id);
                setClaimedTasks(mine);
            }
        } catch (err) {
            console.error('Error fetching claimed tasks:', err);
        }
        setLoadingClaimed(false);
    };

    const fetchTeamMembers = async () => {
        try {
            const res = await fetch('/api/teammates');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    // Open completion form
    const openCompleteForm = () => {
        setCompleteForm({
            completedAt: new Date().toISOString().slice(0, 16),
            completedBy: profile?.name || user?.name || '',
            difficultyScore: 3,
            actualTimeSpent: 0,
            timeUnit: 'minutes',
            resolutionSummary: '',
        });
        setShowCompleteForm(true);
    };

    // Submit completion form
    const handleCompleteSubmit = async () => {
        if (!viewTask) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/tasks/${viewTask.id}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completeForm),
            });
            if (res.ok) {
                await fetchClaimedTasks();
                setViewTask(null);
                setShowCompleteForm(false);
                showSuccess('Task marked as completed!');
            }
        } catch (err) {
            console.error('Error completing task:', err);
        }
        setActionLoading(false);
    };

    // Reassign task to another member
    const handleReassign = async () => {
        if (!viewTask || !reassignTo) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/tasks/${viewTask.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reassignTo }),
            });
            if (res.ok) {
                await fetchClaimedTasks();
                setViewTask(null);
                setShowReassign(false);
                setReassignTo('');
                const memberName = teamMembers.find(m => m.id === reassignTo)?.name || 'member';
                showSuccess(`Task reassigned to ${memberName}!`);
            }
        } catch (err) {
            console.error('Error reassigning task:', err);
        }
        setActionLoading(false);
    };

    // Claimed tasks stats (exclude archived)
    const activeClaimed = claimedTasks.filter(t => t.status !== 'archived');
    const claimedStats = {
        total: activeClaimed.length,
        inProgress: activeClaimed.filter(t => t.status === 'in-progress').length,
        done: activeClaimed.filter(t => t.status === 'done').length,
        overdue: activeClaimed.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'archived').length,
    };

    // For local store tasks
    const currentUserId = 'user-1';
    const myTasks = useMemo(() => {
        return tasks.filter(t => t.assigneeId === currentUserId);
    }, [tasks, currentUserId]);

    const taskStats = useMemo(() => ({
        todo: myTasks.filter(t => t.status === 'todo').length,
        inProgress: myTasks.filter(t => t.status === 'in-progress').length,
        done: myTasks.filter(t => t.status === 'done').length,
    }), [myTasks]);

    const myProjects = useMemo(() => {
        const projectIds = [...new Set(myTasks.map(t => t.projectId))];
        return projects.filter(p => projectIds.includes(p.id));
    }, [myTasks, projects]);

    const activeProjectId = selectedProjectId || myProjects[0]?.id;
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            {successMsg && (
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl shadow-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">{successMsg}</span>
                </div>
            )}

            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">My Tasks</h1>
                <p className="text-slate-500">View and manage your assigned tasks.</p>
            </div>

            {/* Claimed Tasks Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Inbox className="w-4 h-4 text-sky-400" />
                        <span className="text-xs text-slate-500">Total Claimed</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{claimedStats.total}</p>
                </div>
                <div className="p-4 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs text-slate-500">In Progress</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{claimedStats.inProgress}</p>
                </div>
                <div className="p-4 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs text-slate-500">Completed</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{claimedStats.done}</p>
                </div>
                <div className="p-4 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-rose-400" />
                        <span className="text-xs text-slate-500">Overdue</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{claimedStats.overdue}</p>
                </div>
            </div>

            {/* Claimed Tasks Table */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    Claimed Tasks from Fast
                </h2>
                {loadingClaimed ? (
                    <div className="text-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">Loading claimed tasks...</p>
                    </div>
                ) : claimedTasks.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center max-w-sm mx-auto shadow-sm">
                        <Inbox className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-slate-900">No active tasks</h3>
                        <p className="text-slate-500 text-xs mt-1">Go to List Task Queue → View a task → Click &quot;Claim This Task&quot;</p>
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
                                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Deadline</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {claimedTasks.map(task => {
                                        const urgency = urgencyConfig[task.urgency || 'P3'];
                                        const status = statusConfig[task.status] || statusConfig['in-progress'];
                                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                                        return (
                                            <tr key={task.id} className="hover:bg-slate-100/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-sm text-indigo-400">{task.task_token || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${urgency?.bg || 'bg-slate-700'} ${urgency?.style ? '' : 'text-slate-900'}`}
                                                        style={urgency?.style}
                                                    >
                                                        {urgency?.label || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm text-slate-900 font-medium truncate max-w-[250px]">{task.title}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm text-slate-600">{task.requester_name || '—'}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-sm ${isOverdue ? 'text-rose-400 font-medium' : 'text-slate-500'}`}>
                                                        {task.due_date ? formatDate(task.due_date) : '—'}
                                                    </span>
                                                    {isOverdue && (
                                                        <span className="ml-1.5 text-xs bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/30">
                                                            Overdue
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${status.bg} ${status.color}`}>
                                                        {status.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => { setViewTask(task); setShowReassign(false); setReassignTo(''); }}
                                                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* View Task Detail Modal */}
            {viewTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div>
                                <span className="font-mono text-sm text-indigo-400">{viewTask.task_token}</span>
                                <h2 className="text-lg font-semibold text-slate-900 mt-1">{viewTask.title}</h2>
                            </div>
                            <button onClick={() => setViewTask(null)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Detail Content */}
                        <div className="p-6 space-y-4 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div><p className="text-slate-500">Requester</p><p className="text-slate-900">{viewTask.requester_name || '—'}</p></div>
                                <div><p className="text-slate-500">Division</p><p className="text-slate-900">{viewTask.requester_division || '—'}</p></div>
                                <div><p className="text-slate-500">Priority</p><p className="text-slate-900">{viewTask.urgency || '—'}</p></div>
                                <div>
                                    <p className="text-slate-500">Status</p>
                                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${(statusConfig[viewTask.status] || statusConfig['in-progress']).bg} ${(statusConfig[viewTask.status] || statusConfig['in-progress']).color}`}>
                                        {(statusConfig[viewTask.status] || statusConfig['in-progress']).label}
                                    </span>
                                </div>
                                <div><p className="text-slate-500">Submitted</p><p className="text-slate-900">{formatDate(viewTask.created_at)}</p></div>
                                {viewTask.due_date && <div><p className="text-slate-500">Deadline</p><p className="text-slate-900">{formatDate(viewTask.due_date)}</p></div>}
                                {viewTask.request_type && <div><p className="text-slate-500">Type</p><p className="text-slate-900 capitalize">{viewTask.request_type.replace('_', ' ')}</p></div>}
                            </div>

                            {viewTask.description && (
                                <div>
                                    <p className="text-slate-500 mb-1">Description</p>
                                    <p className="text-slate-600 bg-slate-50 rounded-xl p-3">{viewTask.description}</p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            {viewTask.status !== 'done' && (
                                <div className="space-y-3 pt-2">
                                    {/* Complete Button — opens form */}
                                    {!showCompleteForm ? (
                                        <button
                                            onClick={openCompleteForm}
                                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            Mark as Completed
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-4">
                                            <h3 className="text-sm font-semibold text-slate-900">Complete This Task</h3>

                                            {/* Completion Date */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Completion Date & Time</label>
                                                <input
                                                    type="datetime-local"
                                                    value={completeForm.completedAt}
                                                    onChange={(e) => setCompleteForm({ ...completeForm, completedAt: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>

                                            {/* Completed By */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Completed By</label>
                                                <div className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm">
                                                    {completeForm.completedBy || profile?.name || 'You'}
                                                </div>
                                            </div>

                                            {/* Difficulty Score */}
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-slate-500">Difficulty Score</label>
                                                <div className="flex gap-1.5">
                                                    {[{ val: 1, label: 'Trivial' }, { val: 2, label: 'Easy' }, { val: 3, label: 'Medium' }, { val: 4, label: 'Hard' }, { val: 5, label: 'Complex' }].map(d => (
                                                        <button
                                                            key={d.val}
                                                            type="button"
                                                            onClick={() => setCompleteForm({ ...completeForm, difficultyScore: d.val })}
                                                            className={`flex-1 py-2 rounded-lg text-center text-xs font-medium border transition-all ${
                                                                completeForm.difficultyScore === d.val
                                                                    ? 'bg-indigo-500 text-white border-indigo-500'
                                                                    : 'bg-white text-slate-500 border-slate-300 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            <div className="text-sm font-bold">{d.val}</div>
                                                            <div className="text-[10px] mt-0.5">{d.label}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Time Spent */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Actual Time Spent <span className="text-rose-500">*</span></label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={completeForm.actualTimeSpent}
                                                        onChange={(e) => setCompleteForm({ ...completeForm, actualTimeSpent: parseInt(e.target.value) || 0 })}
                                                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                                    />
                                                    <div className="flex gap-1 text-xs">
                                                        <button type="button" onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'minutes' })} className={`px-2.5 py-1.5 rounded-lg ${completeForm.timeUnit === 'minutes' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Min</button>
                                                        <button type="button" onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'hours' })} className={`px-2.5 py-1.5 rounded-lg ${completeForm.timeUnit === 'hours' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Hrs</button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Resolution Summary */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Resolution Summary <span className="text-rose-500">*</span></label>
                                                <textarea
                                                    value={completeForm.resolutionSummary}
                                                    onChange={(e) => setCompleteForm({ ...completeForm, resolutionSummary: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                                    placeholder="What was done to resolve this task?"
                                                />
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowCompleteForm(false)}
                                                    className="flex-1 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
                                                >Cancel</button>
                                                <button
                                                    onClick={handleCompleteSubmit}
                                                    disabled={actionLoading || completeForm.actualTimeSpent <= 0 || !completeForm.resolutionSummary.trim()}
                                                    className="flex-1 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    {actionLoading ? 'Saving...' : 'Done'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Reassign Button / Form */}
                                    {!showReassign ? (
                                        <button
                                            onClick={() => setShowReassign(true)}
                                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-300"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Assign to Other Member
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
                                            <p className="text-sm text-slate-500 font-medium">Select a team member:</p>
                                            <select
                                                value={reassignTo}
                                                onChange={(e) => setReassignTo(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="">Choose member...</option>
                                                {teamMembers
                                                    .filter(m => m.id !== user?.id)
                                                    .map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))
                                                }
                                            </select>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setShowReassign(false); setReassignTo(''); }}
                                                    className="flex-1 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleReassign}
                                                    disabled={!reassignTo || actionLoading}
                                                    className="flex-1 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors text-sm font-medium"
                                                >
                                                    {actionLoading ? 'Reassigning...' : 'Confirm Reassign'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Done state */}
                            {viewTask.status === 'done' && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                                    <p className="text-sm text-emerald-300 flex items-center justify-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" /> This task has been completed
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Calendar Meeting Section */}
            <CalendarMeetingSection />
        </div>
    );
}

// ─── Calendar Meeting Section ─────────────────────────────────────────────────

interface MeetingGuest {
    id: string;
    name: string;
}

interface Meeting {
    id: string;
    title: string;
    description: string | null;
    meeting_date: string;
    start_time: string;
    end_time: string;
    created_by: string;
    assigned_to: string;
    source: string;
    status: string;
    created_at: string;
    notify_before: number;
    creator?: { name: string } | null;
    assignee?: { name: string } | null;
    guests: MeetingGuest[];
}

function CalendarMeetingSection() {
    const { user, profile, isLeader } = useAuth();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
    const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [addGuestId, setAddGuestId] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [pendingNotifyBefore, setPendingNotifyBefore] = useState<number | null>(null);
    const [notifyConfirmed, setNotifyConfirmed] = useState(false);

    // Google Calendar integration
    const [gcalConnected, setGcalConnected] = useState(false);
    const [gcalEvents, setGcalEvents] = useState<any[]>([]);
    const [gcalLoading, setGcalLoading] = useState(false);
    const [gcalConnecting, setGcalConnecting] = useState(false);

    // Teammate Subscriptions
    const [subscribedUsers, setSubscribedUsers] = useState<string[]>([]);
    const [showSubscribeDropdown, setShowSubscribeDropdown] = useState(false);

    const [form, setForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '09:00',
        endTime: '10:00',
        assignedTo: '',
        source: 'member',
    });

    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '',
        endTime: '',
        notifyBefore: 0,
    });

    useEffect(() => {
        fetchMeetings();
        fetchMembers();
        checkGcalStatus();
    }, [currentMonth, user, subscribedUsers]);

    const checkGcalStatus = async () => {
        try {
            const res = await fetch('/api/google-calendar');
            if (res.ok) {
                const json = await res.json();
                const connected = json.data?.connected ?? json.connected;
                setGcalConnected(connected);
                if (connected) fetchGcalEvents();
            }
        } catch { }
    };

    const fetchGcalEvents = async () => {
        setGcalLoading(true);
        try {
            let url = `/api/google-calendar?action=events&year=${currentMonth.year}&month=${currentMonth.month}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                const events = json.data?.events ?? json.events ?? [];
                setGcalEvents(events);
            }
        } catch { }
        setGcalLoading(false);
    };

    // Handle URL search params for deep-linking from notifications
    const searchParams = useSearchParams();
    useEffect(() => {
        const dateParam = searchParams.get('date');
        const meetingIdParam = searchParams.get('meetingId');

        if (dateParam && meetings.length > 0) {
            // Parse the date to set the right month
            const [y, m] = dateParam.split('-').map(Number);
            setCurrentMonth({ year: y, month: m - 1 });
            setSelectedDate(dateParam);

            // If meetingId param, auto-open the meeting detail
            if (meetingIdParam) {
                const meeting = meetings.find(mt => mt.id === meetingIdParam);
                if (meeting) openDetail(meeting);
            }

            // Clear the params so they don't re-trigger
            window.history.replaceState({}, '', '/tasks');
        }
    }, [searchParams, meetings]);

    const getAuthHeaders = async () => {
        return {} as Record<string, string>;
    };

    const fetchMeetings = async () => {
        setLoading(true);
        try {
            const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`;
            let url = `/api/meetings?month=${monthStr}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                setMeetings(json.data ?? json);
            }
        } catch (err) {
            console.error('Error fetching meetings:', err);
        }
        setLoading(false);
    };

    const fetchMembers = async () => {
        try {
            const res = await fetch('/api/teammates');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const handleAddMeeting = async () => {
        if (!form.title || !form.meetingDate || !form.startTime || !form.endTime) return;
        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || null,
                    meetingDate: form.meetingDate,
                    startTime: form.startTime,
                    endTime: form.endTime,
                    assignedTo: form.assignedTo || user?.id,
                    source: isLeader ? 'leader' : form.source,
                }),
            });
            if (res.ok) {
                await fetchMeetings();
                setShowAddModal(false);
                resetForm();
            }
        } catch (err) {
            console.error('Error creating meeting:', err);
        }
    };

    const handleConnectGoogleCalendar = async () => {
        setGcalConnecting(true);
        try {
            const res = await fetch('/api/auth/google');
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                }
            } else {
                console.error('Failed to get Google Auth URL', await res.text());
                setGcalConnecting(false);
            }
        } catch (err) {
            console.error('Error connecting Google Calendar:', err);
            setGcalConnecting(false);
        }
    };

    const handleDeleteMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            await fetchMeetings();
        } catch (err) {
            console.error('Error deleting meeting:', err);
        }
    };

    const handleApproveMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'confirmed' }),
            });
            await fetchMeetings();
        } catch (err) {
            console.error('Error approving meeting:', err);
        }
    };

    const resetForm = () => {
        setForm({ title: '', description: '', meetingDate: '', startTime: '09:00', endTime: '10:00', assignedTo: '', source: 'member' });
    };

    const openAddForDate = (dateStr: string) => {
        resetForm();
        setForm(f => ({ ...f, meetingDate: dateStr }));
        setShowAddModal(true);
    };

    const openDetail = (m: Meeting) => {
        setDetailMeeting(m);
        setIsEditing(false);
        setPendingNotifyBefore(null);
        setNotifyConfirmed(false);
        setEditForm({
            title: m.title,
            description: m.description || '',
            meetingDate: m.meeting_date,
            startTime: m.start_time.slice(0, 5),
            endTime: m.end_time.slice(0, 5),
            notifyBefore: m.notify_before || 0,
        });
    };

    const handleSaveEdit = async () => {
        if (!detailMeeting) return;
        setSavingEdit(true);
        try {
            const res = await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                await fetchMeetings();
                setDetailMeeting(null);
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Error updating meeting:', err);
        }
        setSavingEdit(false);
    };

    const handleAddGuest = async () => {
        if (!detailMeeting || !addGuestId) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: addGuestId }),
            });
            await fetchMeetings();
            // Update detail meeting guests locally
            const member = teamMembers.find(m => m.id === addGuestId);
            if (member) {
                setDetailMeeting(prev => prev ? { ...prev, guests: [...prev.guests, member] } : prev);
            }
            setAddGuestId('');
        } catch (err) {
            console.error('Error adding guest:', err);
        }
    };

    const handleRemoveGuest = async (guestUserId: string) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests?userId=${guestUserId}`, {
                method: 'DELETE',
            });
            await fetchMeetings();
            setDetailMeeting(prev => prev ? { ...prev, guests: prev.guests.filter(g => g.id !== guestUserId) } : prev);
        } catch (err) {
            console.error('Error removing guest:', err);
        }
    };

    const handleSetNotification = async (minutes: number) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifyBefore: minutes }),
            });
            setDetailMeeting(prev => prev ? { ...prev, notify_before: minutes } : prev);
            await fetchMeetings();
        } catch (err) {
            console.error('Error setting notification:', err);
        }
    };

    // Calendar grid helpers
    const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentMonth.year, currentMonth.month, 1).getDay();
    const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prevMonth = () => setCurrentMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
    const nextMonth = () => setCurrentMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

    const getMeetingsForDate = (dateStr: string) => {
        const localMeetings = meetings.filter(m => m.meeting_date === dateStr);
        const googleMeetings = gcalEvents.filter(e => e.meeting_date === dateStr);
        return [...localMeetings, ...googleMeetings];
    };

    const selectedMeetings = selectedDate ? getMeetingsForDate(selectedDate) : [];

    const formatTime = (t: string) => {
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${hour % 12 || 12}:${m} ${ampm}`;
    };

    const getMeetingTheme = (m: any) => {
        if (m.status === 'pending') return { bg: 'bg-amber-500/15', text: 'text-amber-700', dot: 'bg-amber-400' };
        
        if (m.source === 'partner_relations' && m.description) {
            const divMatch = m.description.match(/Division:\s*([^\n]+)/);
            const div = divMatch ? divMatch[1] : '';
            if (div.includes('Marketplace')) return { bg: 'bg-teal-500/15', text: 'text-teal-700', dot: 'bg-teal-500' };
            if (div.includes('Branding')) return { bg: 'bg-pink-500/15', text: 'text-pink-700', dot: 'bg-pink-500' };
            if (div.includes('Business Development')) return { bg: 'bg-rose-500/15', text: 'text-rose-700', dot: 'bg-rose-500' };
            return { bg: 'bg-purple-500/15', text: 'text-purple-700', dot: 'bg-purple-500' };
        }
        
        return { bg: 'bg-indigo-500/15', text: 'text-indigo-700', dot: 'bg-indigo-500' };
    };

    return (
        <>
            <hr className="border-slate-200" />
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-indigo-400" />
                        Calendar Meeting
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button
                                onClick={() => setShowSubscribeDropdown(!showSubscribeDropdown)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full border border-slate-300 shadow-sm transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                Follow Teammates
                                {subscribedUsers.length > 0 && (
                                    <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold">
                                        {subscribedUsers.length}
                                    </span>
                                )}
                            </button>
                            
                            {showSubscribeDropdown && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSubscribeDropdown(false)}></div>
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                                            <h3 className="text-sm font-semibold text-slate-800">Overlay Calendars</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">See events and meetings from others</p>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto p-2">
                                            {teamMembers.filter(m => m.id !== user?.id).map(member => (
                                                <label key={member.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-600"
                                                        checked={subscribedUsers.includes(member.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSubscribedUsers([...subscribedUsers, member.id]);
                                                            } else {
                                                                setSubscribedUsers(subscribedUsers.filter(id => id !== member.id));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm text-slate-700 font-medium">{member.name}</span>
                                                </label>
                                            ))}
                                            {teamMembers.length <= 1 && (
                                                <div className="p-3 text-center text-sm text-slate-500">No other team members found</div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {gcalConnected ? (
                            <span className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 text-emerald-700 text-sm font-medium rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-4 h-4" />
                                Google Calendar Connected
                            </span>
                        ) : (
                            <button
                                onClick={handleConnectGoogleCalendar}
                                disabled={gcalConnecting}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full border border-slate-300 shadow-sm transition-all disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                {gcalConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                            </button>
                        )}
                        <button
                            onClick={() => { resetForm(); setShowAddModal(true); }}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-sm transition-all flex items-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> Add Meeting
                        </button>
                    </div>
                </div>

                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h3 className="text-slate-900 font-semibold text-lg">{monthName}</h3>
                    <button onClick={nextMonth} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-4">
                    {/* Calendar Grid */}
                    <div className="flex-1 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-4">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-slate-300">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 uppercase tracking-wider">{d}</div>
                            ))}
                        </div>

                        {/* Calendar cells */}
                        <div className="grid grid-cols-7">
                            {/* Empty cells for days before the first */}
                            {Array.from({ length: firstDayOfWeek }, (_, i) => (
                                <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-slate-200/60" />
                            ))}

                            {/* Day cells */}
                            {Array.from({ length: daysInMonth }, (_, i) => {
                                const day = i + 1;
                                const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                const dayMeetings = getMeetingsForDate(dateStr);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDate;

                                return (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                                        className={`min-h-[100px] p-1.5 border-b border-r border-slate-200/60 text-left transition-all flex flex-col ${
                                            isSelected
                                                ? 'bg-indigo-500/10'
                                                : 'hover:bg-slate-100/30'
                                        }`}
                                    >
                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm mb-1 ${
                                            isToday
                                                ? 'bg-indigo-500 text-white font-bold'
                                                : isSelected
                                                    ? 'text-indigo-700 font-semibold'
                                                    : 'text-slate-600'
                                        }`}>
                                            {day}
                                        </span>
                                        <div className="flex flex-col gap-0.5 w-full overflow-hidden">
                                            {dayMeetings.slice(0, 2).map((m, idx) => {
                                                const theme = getMeetingTheme(m);
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate ${theme.bg} ${theme.text}`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${theme.dot}`} />
                                                        <span className="truncate">{formatTime(m.start_time).replace(' ', '')} {m.title}</span>
                                                    </div>
                                                );
                                            })}
                                            {dayMeetings.length > 2 && (
                                                <span className="text-[10px] text-slate-500 pl-1">+{dayMeetings.length - 2} more</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-200">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-indigo-500" /> FBI Member
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-purple-500" /> Partner Relationship (PR)
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-teal-500" /> Marketplace (MP)
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-pink-500" /> Branding
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-rose-500" /> Business Development (BD)
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-amber-400" /> Pending
                            </div>
                        </div>
                    </div>

                    {/* Day Detail Panel */}
                    <div className="w-80 bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-4 flex flex-col">
                        {selectedDate ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-slate-900">
                                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </h4>
                                    <button
                                        onClick={() => openAddForDate(selectedDate)}
                                        className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        title="Add meeting on this date"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {selectedMeetings.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-slate-500">No meetings scheduled</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 flex-1 overflow-y-auto">
                                        {selectedMeetings.map((m, idx) => {
                                            const theme = getMeetingTheme(m);
                                            return (
                                                <button
                                                    key={m.id || `meeting-${idx}`}
                                                    onClick={() => openDetail(m)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-colors hover:bg-slate-200/30 ${m.status === 'pending' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-50 border-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`} />
                                                        <p className="text-sm font-medium text-slate-900 truncate">{m.title}</p>
                                                    </div>
                                                <p className="text-xs text-slate-500 mt-1 ml-4">
                                                    {formatTime(m.start_time)} – {formatTime(m.end_time)}
                                                </p>
                                                {m.assignee?.name && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👤 {m.assignee.name}</p>
                                                )}
                                                {m.guests?.length > 0 && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👥 {m.guests.length} guest{m.guests.length > 1 ? 's' : ''}</p>
                                                )}
                                                {m.status === 'pending' && (
                                                    <span className="inline-flex ml-4 mt-1 px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                                                        Pending
                                                    </span>
                                                )}
                                            </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <CalendarIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">Select a day to view meetings</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Meeting Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Add Meeting</h2>
                            <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Title */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Meeting Title *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Sprint Planning"
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Date */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input
                                    type="date"
                                    value={form.meetingDate}
                                    onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                />
                            </div>

                            {/* Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start Time *</label>
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End Time *</label>
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                            </div>

                            {/* Assign To (Leaders only) */}
                            {isLeader && (
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Assign To</label>
                                    <select
                                        value={form.assignedTo}
                                        onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="">Myself</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes (Optional)</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Meeting agenda or notes..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleAddMeeting}
                                disabled={!form.title || !form.meetingDate}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                <CalendarIcon className="w-5 h-5" /> Create Meeting
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meeting Detail Modal */}
            {detailMeeting && !isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${getMeetingTheme(detailMeeting).dot}`} />
                                <h2 className="text-lg font-semibold text-slate-900 truncate">{detailMeeting.title}</h2>
                            </div>
                            <div className="flex items-center gap-1">
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                )}
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => { handleDeleteMeeting(detailMeeting.id); setDetailMeeting(null); }} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => setDetailMeeting(null)} className="p-1.5 text-slate-500 hover:text-slate-900">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Date & Time */}
                            <div className="flex items-center gap-3">
                                <CalendarIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-slate-900">
                                        {new Date(detailMeeting.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {formatTime(detailMeeting.start_time)} – {formatTime(detailMeeting.end_time)}
                                    </p>
                                </div>
                            </div>

                            {/* Description */}
                            {detailMeeting.description && (
                                <div className="flex items-start gap-3">
                                    <FileText className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{detailMeeting.description}</p>
                                </div>
                            )}

                            {/* Organizer */}
                            <div className="flex items-center gap-3">
                                <UserPlus className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">Organizer</p>
                                    <p className="text-sm text-slate-900">
                                        {detailMeeting.source === 'partner_relations' 
                                            ? (detailMeeting.description?.match(/Requester:\s*([^\n]+)/)?.[1] || 'Unknown Partner')
                                            : (detailMeeting.creator?.name || 'Unknown')}
                                    </p>
                                </div>
                            </div>

                            {/* Guests */}
                            <div className="flex items-start gap-3">
                                <Users className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">
                                        {detailMeeting.guests.length} guest{detailMeeting.guests.length !== 1 ? 's' : ''}
                                    </p>

                                    {/* Guest list */}
                                    {detailMeeting.guests.length > 0 && (
                                        <div className="space-y-1.5 mb-3">
                                            {detailMeeting.guests.map(g => (
                                                <div key={g.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                                                            {g.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm text-slate-600">{g.name}</span>
                                                    </div>
                                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                                        <button
                                                            onClick={() => handleRemoveGuest(g.id)}
                                                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                                            title="Remove guest"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add guest */}
                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                        <div className="flex gap-2">
                                            <select
                                                value={addGuestId}
                                                onChange={e => setAddGuestId(e.target.value)}
                                                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="">Add guest...</option>
                                                {teamMembers
                                                    .filter(m => !detailMeeting.guests.some(g => g.id === m.id) && m.id !== detailMeeting.created_by)
                                                    .map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                            </select>
                                            <button
                                                onClick={handleAddGuest}
                                                disabled={!addGuestId}
                                                className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notification */}
                            <div className="flex items-start gap-3">
                                <Bell className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">Notification</p>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {[{ val: 5, label: '5 min' }, { val: 10, label: '10 min' }, { val: 15, label: '15 min' }, { val: 30, label: '30 min' }, { val: 60, label: '1 hour' }].map(opt => (
                                            <button
                                                key={opt.val}
                                                onClick={() => setPendingNotifyBefore(opt.val)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                                    (pendingNotifyBefore ?? detailMeeting.notify_before ?? 0) === opt.val
                                                        ? 'bg-indigo-500 text-white border-indigo-500'
                                                        : 'bg-slate-100 text-slate-500 border-slate-300 hover:text-slate-900'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                        {pendingNotifyBefore !== null && pendingNotifyBefore !== (detailMeeting.notify_before ?? 0) && !notifyConfirmed && (
                                            <button
                                                onClick={() => setNotifyConfirmed(true)}
                                                className="ml-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                                            >
                                                Set
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status badges */}
                            {detailMeeting.status === 'pending' && isLeader && (
                                <button
                                    onClick={() => { handleApproveMeeting(detailMeeting.id); setDetailMeeting(null); }}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                                >
                                    <CheckCircle2 className="w-5 h-5" /> Approve Meeting
                                </button>
                            )}

                            {/* Save & Cancel — shown for organizer/leader OR after notification Set is clicked */}
                            {(notifyConfirmed || ((isLeader || detailMeeting.created_by === user?.id) && false)) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => {
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                        }}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (pendingNotifyBefore !== null) {
                                                await handleSetNotification(pendingNotifyBefore);
                                            }
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                            setDetailMeeting(null);
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : (isLeader || detailMeeting.created_by === user?.id) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => setDetailMeeting(null)}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => { handleSaveEdit(); }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Meeting Modal */}
            {detailMeeting && isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Edit Meeting</h2>
                            <button onClick={() => setIsEditing(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Title *</label>
                                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input type="date" value={editForm.meetingDate} onChange={e => setEditForm(f => ({ ...f, meetingDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start *</label>
                                    <input type="time" value={editForm.startTime} onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End *</label>
                                    <input type="time" value={editForm.endTime} onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes</label>
                                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold shadow-sm transition-colors">Cancel</button>
                                <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.title} className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 text-sm font-bold shadow-sm transition-all">
                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
export default function MyTasksPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading tasks...</div>}>
            <MyTasksContent />
        </Suspense>
    );
}
