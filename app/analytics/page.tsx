'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { BarChart3, Clock, CheckCircle2, TrendingUp, Star, Users, PieChart, Calendar, Filter, ShieldAlert, RotateCcw } from 'lucide-react';

interface AnalyticsData {
    totalTickets: number;
    completedTickets: number;
    completionRate: number;
    avgCompletionHours: number;
    avgDifficulty: number | null;
    urgencyCounts: Record<string, number>;
    divisionCounts: Record<string, number>;
    completedInPeriod: number;
    periodLabel: string;
    topPerformers: { name: string; count: number }[];
    statusCounts: Record<string, number>;
    teamRatings?: { name: string; avgRating: number; reviewCount: number }[];
}

type FilterMode = 'preset' | 'date' | 'month' | 'year';
type PresetOption = 'today' | 'week' | 'last30' | 'all';

const statusLabels: Record<string, { label: string; color: string }> = {
    'todo': { label: 'Queue', color: 'bg-sky-500' },
    'in-progress': { label: 'In Progress', color: 'bg-indigo-500' },
    'done': { label: 'Completed', color: 'bg-emerald-500' },
    'archived': { label: 'Archived', color: 'bg-slate-500' },
};

const urgencyColors: Record<string, string> = {
    'P1': 'bg-rose-500',
    'P2': 'bg-orange-500',
    'P3': 'bg-amber-500',
    'P4': 'bg-emerald-500',
    '5-minute': 'bg-sky-500',
    'Unset': 'bg-slate-500',
};

function getDateRange(mode: FilterMode, preset: PresetOption, dateFrom: string, dateTo: string, customMonth: string, customYear: string): { from: string | null; to: string | null; label: string } {
    const now = new Date();

    if (mode === 'preset') {
        if (preset === 'today') {
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return { from: today.toISOString(), to: today.toISOString().split('T')[0], label: 'Today' };
        }
        if (preset === 'week') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return { from: weekStart.toISOString(), to: null, label: 'This Week' };
        }
        if (preset === 'last30') {
            const thirtyAgo = new Date(now);
            thirtyAgo.setDate(now.getDate() - 30);
            thirtyAgo.setHours(0, 0, 0, 0);
            return { from: thirtyAgo.toISOString(), to: null, label: 'Last 30 Days' };
        }
        return { from: null, to: null, label: 'All Time' };
    }

    if (mode === 'date' && (dateFrom || dateTo)) {
        const fmt = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
        const fromLabel = dateFrom ? fmt(dateFrom) : '...';
        const toLabel = dateTo ? fmt(dateTo) : '...';
        return { from: dateFrom || null, to: dateTo || null, label: `${fromLabel} → ${toLabel}` };
    }

    if (mode === 'month' && customMonth) {
        const [year, month] = customMonth.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0); // last day of month
        return {
            from: start.toISOString().split('T')[0],
            to: end.toISOString().split('T')[0],
            label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }

    if (mode === 'year' && customYear) {
        return {
            from: `${customYear}-01-01`,
            to: `${customYear}-12-31`,
            label: customYear,
        };
    }

    return { from: null, to: null, label: 'All Time' };
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const { isLeader, loading: authLoading } = useAuth();
    const router = useRouter();

    // Role guard: redirect non-Leader users
    useEffect(() => {
        if (!authLoading && !isLeader) {
            const timer = setTimeout(() => router.push('/'), 3000);
            return () => clearTimeout(timer);
        }
    }, [authLoading, isLeader, router]);

    // Filter state
    const [filterMode, setFilterMode] = useState<FilterMode>('preset');
    const [preset, setPreset] = useState<PresetOption>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const dateFromRef = useRef<HTMLInputElement>(null);
    const dateToRef = useRef<HTMLInputElement>(null);
    const [customMonth, setCustomMonth] = useState('');
    const [customYear, setCustomYear] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { from, to } = getDateRange(filterMode, preset, dateFrom, dateTo, customMonth, customYear);
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);

            const res = await fetch(`/api/analytics?${params.toString()}`);
            const json = await res.json();
            if (json.status === 'success') {
                setData(json.data);
            } else {
                console.error('Failed to fetch analytics:', json.message || res.status);
            }
        } catch (err) {
            console.error('Error fetching analytics:', err);
        }
        setLoading(false);
    }, [filterMode, preset, dateFrom, dateTo, customMonth, customYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Generate year options (current year down to 5 years ago)
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

    const { label: activeLabel } = getDateRange(filterMode, preset, dateFrom, dateTo, customMonth, customYear);

    // Access denied for non-Leader users
    if (!authLoading && !isLeader) {
        return (
            <div className="flex flex-col items-center justify-center min-h-96 gap-4">
                <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center">
                    <ShieldAlert className="w-8 h-8 text-rose-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Access Denied</h2>
                <p className="text-slate-500 text-center max-w-md">
                    The Analytics page is only available to users with the <span className="font-semibold text-indigo-600">Leader</span> role.
                </p>
                <p className="text-sm text-slate-400">Redirecting to Dashboard...</p>
            </div>
        );
    }

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <p className="text-slate-500">Failed to load analytics data.</p>
            </div>
        );
    }

    const {
        totalTickets, completedTickets, completionRate, avgCompletionHours,
        avgDifficulty, urgencyCounts, divisionCounts, completedInPeriod,
        periodLabel, topPerformers, statusCounts, teamRatings
    } = data;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Analytics</h1>
                <p className="text-slate-500">Track FAST team performance, workload, and completion metrics.</p>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-slate-900">Filter Analytics</span>
                    <span className="ml-auto px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-600 text-xs font-medium">
                        {activeLabel}
                    </span>
                </div>

                {/* Filter Mode Tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {[
                        { key: 'preset' as FilterMode, label: 'Quick Filter' },
                        { key: 'date' as FilterMode, label: 'By Date' },
                        { key: 'month' as FilterMode, label: 'By Month' },
                        { key: 'year' as FilterMode, label: 'By Year' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilterMode(tab.key)}
                            className={`px-4 py-2 text-sm rounded-xl font-medium transition-all duration-200 ${
                                filterMode === tab.key
                                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                                    : 'bg-slate-50 text-slate-500 hover:bg-slate-200/50 hover:text-slate-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    {filterMode === 'preset' && (
                        <>
                            {[
                                { key: 'today' as PresetOption, label: 'Today' },
                                { key: 'week' as PresetOption, label: 'This Week' },
                                { key: 'last30' as PresetOption, label: 'Last 30 Days' },
                                { key: 'all' as PresetOption, label: 'All Time' },
                            ].map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setPreset(opt.key)}
                                    className={`px-4 py-2 text-sm rounded-xl font-medium transition-all duration-200 ${
                                        preset === opt.key
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-slate-100/30 text-slate-500 border border-slate-300/50 hover:bg-slate-200/30 hover:text-slate-800'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </>
                    )}

                    {filterMode === 'date' && (
                        <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">From</span>
                                <div
                                    className="relative bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 cursor-pointer hover:border-slate-600 transition-colors min-w-[130px]"
                                    onClick={() => dateFromRef.current?.showPicker()}
                                >
                                    <input
                                        ref={dateFromRef}
                                        type="date"
                                        value={dateFrom}
                                        onChange={e => setDateFrom(e.target.value)}
                                        className="absolute inset-0 opacity-0 pointer-events-none"
                                        tabIndex={-1}
                                    />
                                    {dateFrom ? (() => { const [y,m,d] = dateFrom.split('-'); return `${d}/${m}/${y}`; })() : <span className="text-slate-500">DD/MM/YYYY</span>}
                                </div>
                                <span className="text-xs text-slate-500">To</span>
                                <div
                                    className="relative bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 cursor-pointer hover:border-slate-600 transition-colors min-w-[130px]"
                                    onClick={() => dateToRef.current?.showPicker()}
                                >
                                    <input
                                        ref={dateToRef}
                                        type="date"
                                        value={dateTo}
                                        onChange={e => setDateTo(e.target.value)}
                                        className="absolute inset-0 opacity-0 pointer-events-none"
                                        tabIndex={-1}
                                    />
                                    {dateTo ? (() => { const [y,m,d] = dateTo.split('-'); return `${d}/${m}/${y}`; })() : <span className="text-slate-500">DD/MM/YYYY</span>}
                                </div>
                                {(dateFrom || dateTo) && (
                                    <button
                                        onClick={() => {
                                            setDateFrom('');
                                            setDateTo('');
                                        }}
                                        className="ml-2 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {filterMode === 'month' && (
                        <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <input
                                type="month"
                                value={customMonth}
                                onChange={e => setCustomMonth(e.target.value)}
                                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 "
                            />
                        </div>
                    )}

                    {filterMode === 'year' && (
                        <div className="flex items-center gap-3">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <select
                                value={customYear}
                                onChange={e => setCustomYear(e.target.value)}
                                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 appearance-none cursor-pointer"
                            >
                                <option value="" className="bg-white">Select Year</option>
                                {yearOptions.map(y => (
                                    <option key={y} value={y} className="bg-white">{y}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-indigo-400" />
                        </div>
                        <span className="text-sm text-slate-500">Total Tickets</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{totalTickets}</p>
                </div>

                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-sm text-slate-500">Completion Rate</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{completionRate}%</p>
                    <p className="text-xs text-slate-500 mt-1">{completedTickets} of {totalTickets} completed</p>
                </div>

                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-sm text-slate-500">Avg Resolution Time</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{avgCompletionHours}h</p>
                </div>

                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                            <Star className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-sm text-slate-500">Avg Difficulty</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{avgDifficulty ?? '—'}</p>
                    <p className="text-xs text-slate-500 mt-1">out of 5</p>
                </div>
            </div>

            {/* Period Summary */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-lg font-semibold text-slate-900">{periodLabel}</h3>
                </div>
                <p className="text-4xl font-bold text-slate-900">{completedInPeriod} <span className="text-lg font-normal text-slate-500">tasks completed</span></p>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Urgency Breakdown */}
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Tickets by Urgency</h3>
                    <div className="space-y-3">
                        {Object.entries(urgencyCounts).length > 0 ? (
                            Object.entries(urgencyCounts)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([urgency, count]) => {
                                    const pct = totalTickets > 0 ? (count / totalTickets) * 100 : 0;
                                    return (
                                        <div key={urgency} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">{urgency}</span>
                                                <span className="text-slate-500">{count} ({Math.round(pct)}%)</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${urgencyColors[urgency] || 'bg-slate-500'}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                        ) : (
                            <p className="text-sm text-slate-500">No data available</p>
                        )}
                    </div>
                </div>

                {/* Division Breakdown */}
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Tickets by Division</h3>
                    <div className="space-y-3">
                        {Object.entries(divisionCounts).length > 0 ? (
                            Object.entries(divisionCounts)
                                .sort(([, a], [, b]) => b - a)
                                .map(([division, count]) => {
                                    const pct = totalTickets > 0 ? (count / totalTickets) * 100 : 0;
                                    return (
                                        <div key={division} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">{division}</span>
                                                <span className="text-slate-500">{count} ({Math.round(pct)}%)</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                        ) : (
                            <p className="text-sm text-slate-500">No data available</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Row: Status + Top Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Breakdown */}
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <PieChart className="w-5 h-5 text-indigo-400" />
                        <h3 className="text-lg font-semibold text-slate-900">Task Status</h3>
                    </div>
                    <div className="space-y-3">
                        {Object.entries(statusCounts).length > 0 ? (
                            Object.entries(statusCounts)
                                .sort(([, a], [, b]) => b - a)
                                .map(([status, count]) => {
                                    const cfg = statusLabels[status] || { label: status, color: 'bg-slate-500' };
                                    const pct = totalTickets > 0 ? (count / totalTickets) * 100 : 0;
                                    return (
                                        <div key={status} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">{cfg.label}</span>
                                                <span className="text-slate-500">{count} ({Math.round(pct)}%)</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${cfg.color}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                        ) : (
                            <p className="text-sm text-slate-500">No data available</p>
                        )}
                    </div>
                </div>

                {/* Top Performers */}
                <div className="bg-white shadow-sm border-slate-200 border border-slate-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Users className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-lg font-semibold text-slate-900">Top Performers</h3>
                    </div>
                    <div className="space-y-3">
                        {topPerformers.length > 0 ? (
                            topPerformers.map((performer, i) => (
                                <div key={performer.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                            i === 0 ? 'bg-amber-100 text-amber-600'
                                                : i === 1 ? 'bg-slate-200 text-slate-700'
                                                    : i === 2 ? 'bg-orange-100 text-orange-600'
                                                        : 'bg-slate-700 text-slate-500'
                                        }`}>
                                            {i + 1}
                                        </span>
                                        <span className="text-sm text-slate-800">{performer.name}</span>
                                    </div>
                                    <span className="text-sm font-medium text-emerald-400">{performer.count} tasks</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">No completed tasks yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Team Ratings */}
            {teamRatings && teamRatings.length > 0 && (
                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Star className="w-5 h-5 text-amber-400" />
                        <h3 className="text-lg font-semibold text-slate-900">Team Ratings</h3>
                        <span className="text-xs text-slate-400 ml-auto">Based on requester reviews</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teamRatings.map((member, i) => (
                            <div key={member.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                    member.avgRating >= 4.5 ? 'bg-amber-100 text-amber-600' :
                                    member.avgRating >= 3.5 ? 'bg-emerald-100 text-emerald-600' :
                                    'bg-slate-200 text-slate-600'
                                }`}>
                                    {member.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">{member.name}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <span key={s} className={`text-sm ${s <= Math.round(member.avgRating) ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                                        ))}
                                        <span className="text-xs font-semibold text-slate-700 ml-1">{member.avgRating}</span>
                                        <span className="text-xs text-slate-400">({member.reviewCount})</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}

// ==========================================
// ORBIT Analytics Sub-component
// ==========================================

interface OrbitData {
    overallCompliance: number;
    compliance: Record<string, { total: number; claimed: number; completed: number }>;
    topClaimers: { name: string; image: string | null; totalClaims: number; completedClaims: number; completionRate: number }[];
    templateCompliance: { id: string; name: string; frequency: string; status: string }[];
    totalTemplates: number;
    totalClaimed: number;
}

function OrbitAnalyticsSection() {
    const [data, setData] = useState<OrbitData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/orbit/analytics')
            .then((r) => r.ok ? r.json() : null)
            .then(setData)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="mt-8 flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) return null;

    const freqLabels: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    const statusColors: Record<string, string> = {
        unclaimed: 'bg-slate-200',
        claimed: 'bg-indigo-500',
        completed: 'bg-emerald-500',
    };

    return (
        <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
                <RotateCcw className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-800">AHA ORBIT Analytics</h2>
            </div>

            {/* Top KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Overall Compliance */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Overall Compliance</p>
                    <div className="flex items-end gap-2">
                        <p className="text-3xl font-bold text-indigo-600">{data.overallCompliance}%</p>
                        <p className="text-xs text-slate-400 mb-1">{data.totalClaimed} of {data.totalTemplates} claimed</p>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${data.overallCompliance}%` }} />
                    </div>
                </div>

                {/* Per-frequency compliance */}
                {(['daily', 'weekly', 'monthly'] as const).map((freq) => {
                    const c = data.compliance[freq];
                    if (!c || c.total === 0) return null;
                    const pct = Math.round((c.claimed / c.total) * 100);
                    return (
                        <div key={freq} className="bg-white border border-slate-200 rounded-2xl p-5">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{freqLabels[freq]} Tasks</p>
                            <div className="flex items-end gap-2">
                                <p className="text-2xl font-bold text-slate-800">{c.claimed}/{c.total}</p>
                                <p className="text-xs text-emerald-500 mb-1">{c.completed} completed</p>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Claimers */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Routine Task Claimers</p>
                    <div className="space-y-3">
                        {data.topClaimers.length > 0 ? (
                            data.topClaimers.map((claimer, i) => (
                                <div key={claimer.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                            i === 0 ? 'bg-amber-100 text-amber-600'
                                                : i === 1 ? 'bg-slate-200 text-slate-700'
                                                    : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {i + 1}
                                        </span>
                                        <div>
                                            <span className="text-sm text-slate-800">{claimer.name}</span>
                                            <span className="text-xs text-slate-400 ml-2">{claimer.completionRate}% done</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-medium text-indigo-500">{claimer.totalClaims} claims</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">No claims yet</p>
                        )}
                    </div>
                </div>

                {/* Template Compliance */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Team Compliance with Master Tasks</p>
                    <div className="space-y-2">
                        {data.templateCompliance.length > 0 ? (
                            data.templateCompliance.map((t) => (
                                <div key={t.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[t.status]}`} />
                                        <span className="text-sm text-slate-700">{t.name}</span>
                                        <span className="text-[10px] text-slate-400 capitalize">({t.frequency})</span>
                                    </div>
                                    <span className={`text-xs font-medium capitalize ${
                                        t.status === 'completed' ? 'text-emerald-500' :
                                        t.status === 'claimed' ? 'text-indigo-500' : 'text-slate-400'
                                    }`}>
                                        {t.status}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">No templates created yet</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
