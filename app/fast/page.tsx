'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { CountdownTimer } from '@/components/CountdownTimer';
import { getPresence } from '@/lib/presence';
import Link from 'next/link';
import {
    CheckCircle2, ListTodo, Clock, AlertTriangle, X, Search,
    ChevronLeft, ChevronRight, Activity, MessageSquare, UserPlus,
    Shield, FileText, RotateCcw, Users, Zap, Eye, ArrowRight, BarChart3,
} from 'lucide-react';

const urgencyDots: Record<string, string> = {
    'P1': 'bg-rose-500', 'P2': 'bg-orange-500', 'P3': 'bg-amber-500',
    'P4': 'bg-emerald-500', '5-minute': 'bg-sky-400',
};

const statusLabels: Record<string, { label: string; color: string }> = {
    'todo': { label: 'To Do', color: 'text-slate-500' },
    'in-progress': { label: 'In Progress', color: 'text-indigo-500' },
    'review': { label: 'Review', color: 'text-purple-500' },
    'pending_completion_details': { label: 'Completing', color: 'text-amber-500' },
};

const activityIcons: Record<string, any> = {
    task_claimed: ListTodo, task_completed: CheckCircle2,
    channel_message: MessageSquare, user_registered: UserPlus,
    user_approved: Shield, request_submitted: FileText,
    orbit_claimed: RotateCcw, orbit_completed: CheckCircle2,
    direct_request_approved: CheckCircle2,
};

function formatRelative(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FastDashboard() {
    const { profile } = useAuth();

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [calMonth, setCalMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });


    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/dashboard/widgets');
            if (res.ok) setData(await res.json());
        } catch {} finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchData();
        // Refresh every 30s so presence statuses update
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleDirectAction = async (taskId: string, action: 'approve' | 'decline') => {
        await fetch(`/api/tasks/${taskId}/direct-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        fetchData();
    };

    // Mini calendar helpers
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    const firstDayOfWeek = new Date(calMonth.year, calMonth.month, 1).getDay();
    const monthName = new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = new Date();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) return null;

    const displayName = profile?.name?.split(' ')[0] || 'there';
    const filteredTasks = searchQuery
        ? data.myTasks.filter((t: any) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : data.myTasks;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Welcome Header + Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Welcome, {displayName}!</h1>
                    <p className="text-slate-500">Here is your agenda for today</p>
                </div>
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                </div>
            </div>

            {/* Pending Direct Requests Banner */}
            {data.pendingDirectRequests.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-800">
                            {data.pendingDirectRequests.length} Direct Request{data.pendingDirectRequests.length > 1 ? 's' : ''} Waiting
                        </span>
                    </div>
                    <div className="space-y-2">
                        {data.pendingDirectRequests.map((req: any) => (
                            <div key={req.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urgencyDots[req.urgency] || 'bg-slate-400'}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{req.title}</p>
                                        <p className="text-xs text-slate-500">From {req.requesterName} · {req.requesterDivision || 'N/A'}</p>
                                    </div>
                                </div>
                                {req.responseDeadline && <CountdownTimer deadline={req.responseDeadline} compact />}
                                <div className="flex items-center gap-1.5 ml-3">
                                    <button onClick={() => handleDirectAction(req.id, 'approve')} className="px-3 py-1 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Approve</button>
                                    <button onClick={() => handleDirectAction(req.id, 'decline')} className="px-3 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200">Decline</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Grid: Calendar + Tasks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mini Calendar */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800">{monthName}</h3>
                        <div className="flex gap-1">
                            <button onClick={() => setCalMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })} className="p-1 hover:bg-slate-100 rounded-lg">
                                <ChevronLeft className="w-4 h-4 text-slate-400" />
                            </button>
                            <button onClick={() => setCalMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })} className="p-1 hover:bg-slate-100 rounded-lg">
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(d => (
                            <div key={d} className="text-[10px] font-semibold text-slate-400 py-1">{d}</div>
                        ))}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const isToday = day === today.getDate() && calMonth.month === today.getMonth() && calMonth.year === today.getFullYear();
                            return (
                                <div
                                    key={day}
                                    className={`text-xs py-1.5 rounded-lg font-medium ${
                                        isToday
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                >
                                    {day}
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick Stats below calendar */}
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-emerald-500">{data.stats.completed}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Completed</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-indigo-500">{data.stats.active}</p>
                            <p className="text-[10px] text-slate-400 font-medium">Active</p>
                        </div>
                    </div>
                </div>

                {/* My Tasks */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" />
                            My Active Tasks
                        </h3>
                        <Link href="/tasks" className="text-xs font-medium text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                            View all <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                    {filteredTasks.length === 0 ? (
                        <div className="text-center py-8">
                            <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">All caught up! No active tasks.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredTasks.map((task: any) => {
                                const st = statusLabels[task.status] || { label: task.status, color: 'text-slate-500' };
                                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done' && task.status !== 'pending';
                                return (
                                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition-colors">
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${urgencyDots[task.urgency] || 'bg-slate-300'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={`text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                                                {task.requesterName && <span className="text-[10px] text-slate-400">· {task.requesterName}</span>}
                                                {task.source === 'direct_request' && (
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">Direct</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {isOverdue && (
                                                <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full font-semibold">Overdue</span>
                                            )}
                                            <span className="text-[10px] text-slate-400">{formatRelative(task.createdAt)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row: Recent Activity + Team */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-500" />
                            Recent Activity
                        </h3>
                    </div>
                    {data.recentActivity.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No recent activity</p>
                    ) : (
                        <div className="space-y-3">
                            {data.recentActivity.map((act: any) => {
                                const Icon = activityIcons[act.action] || Activity;
                                return (
                                    <div key={act.id} className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden">
                                            {act.user.image ? (
                                                <img src={act.user.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : act.user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-700 line-clamp-2">{act.description}</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(act.createdAt)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Team Directory */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Users className="w-4 h-4 text-rose-500" />
                            Team Directory
                        </h3>
                        <span className="text-[10px] font-medium text-slate-400">{data.stats.teamCount} members</span>
                    </div>
                    {data.teamMembers.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No team assigned</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {data.teamMembers.map((member: any) => (
                                <div key={member.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden">
                                        {member.image ? (
                                            <img src={member.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                                        ) : member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-slate-800 truncate">{member.name}</p>
                                        <p className="text-[10px] text-slate-400 capitalize">
                                            {member.role === 'admin' ? 'Master' : member.role === 'leader' ? 'Leader' : 'Member'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                        <span className={`w-2.5 h-2.5 rounded-full ${getPresence(member.lastSeenAt).dot}`} />
                                        <span className={`text-[9px] font-medium ${getPresence(member.lastSeenAt).color}`}>
                                            {getPresence(member.lastSeenAt).label}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Insights Row */}
            {data.insights && (
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-500" />
                        My Performance Insights
                    </h3>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Completion Rate</p>
                            <p className="text-2xl font-bold text-emerald-500">{data.insights.completionRate}%</p>
                            <p className="text-[10px] text-slate-400">{data.stats.completed} of {data.stats.total} tasks</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Avg Resolution</p>
                            <p className="text-2xl font-bold text-indigo-500">{data.insights.avgResolutionHours}h</p>
                            <p className="text-[10px] text-slate-400">per task</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">This Week</p>
                            <p className="text-2xl font-bold text-amber-500">{data.insights.thisWeekCompleted}</p>
                            <p className="text-[10px] text-slate-400">tasks completed</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Avg Difficulty</p>
                            <p className="text-2xl font-bold text-purple-500">{data.insights.avgDifficulty ?? '—'}</p>
                            <p className="text-[10px] text-slate-400">out of 5</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Avg Rating</p>
                            <div className="flex items-center gap-1.5">
                                <p className="text-2xl font-bold text-amber-500">{data.insights.avgRating ?? '—'}</p>
                                {data.insights.avgRating && <span className="text-amber-400 text-lg">★</span>}
                            </div>
                            <p className="text-[10px] text-slate-400">{data.insights.totalReviews || 0} reviews</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Active Today</p>
                            <p className="text-2xl font-bold text-sky-500">
                                {(() => {
                                    const s = data.insights.activeSecondsToday || 0;
                                    const h = Math.floor(s / 3600);
                                    const m = Math.floor((s % 3600) / 60);
                                    return h > 0 ? `${h}h ${m}m` : `${m}m`;
                                })()}
                            </p>
                            <p className="text-[10px] text-slate-400">time online</p>
                        </div>
                    </div>

                    {/* Bottom: Urgency Breakdown + Orbit Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Urgency Breakdown */}
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Tasks by Priority</p>
                            {Object.keys(data.insights.urgencyBreakdown).length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No tasks yet</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {Object.entries(data.insights.urgencyBreakdown)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([urgency, count]: [string, any]) => {
                                            const pct = data.stats.total > 0 ? Math.round((count / data.stats.total) * 100) : 0;
                                            const barColors: Record<string, string> = {
                                                'P1': 'bg-rose-500', 'P2': 'bg-orange-500', 'P3': 'bg-amber-500',
                                                'P4': 'bg-emerald-500', '5-minute': 'bg-sky-400', 'Unset': 'bg-slate-400',
                                            };
                                            return (
                                                <div key={urgency}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-medium text-slate-700">{urgency === '5-minute' ? '5-Min' : urgency}</span>
                                                        <span className="text-xs text-slate-500">{count} ({pct}%)</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${barColors[urgency] || 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Orbit Stats */}
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Routine Tasks (Orbit)</p>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="text-center p-3 bg-slate-50 rounded-xl">
                                    <p className="text-xl font-bold text-indigo-500">{data.insights.orbitClaims}</p>
                                    <p className="text-[10px] text-slate-400">Total Claimed</p>
                                </div>
                                <div className="text-center p-3 bg-slate-50 rounded-xl">
                                    <p className="text-xl font-bold text-emerald-500">{data.insights.orbitCompleted}</p>
                                    <p className="text-[10px] text-slate-400">Completed</p>
                                </div>
                            </div>
                            {data.insights.orbitClaims > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-slate-500">Completion Rate</span>
                                        <span className="text-xs font-semibold text-emerald-500">
                                            {Math.round((data.insights.orbitCompleted / data.insights.orbitClaims) * 100)}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{ width: `${Math.round((data.insights.orbitCompleted / data.insights.orbitClaims) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
