'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatsCard } from '@/components/dashboard';

import {
    CheckCircle2,
    ListTodo,
    Users,
    TrendingUp,
    BarChart3,
    Clock,
    Star,
} from 'lucide-react';

interface DashboardData {
    completedTasks: number;
    activeTasks: number;
    teamMemberCount: number;
    totalTickets: number;
    completionRate: number;
    avgResolutionHours: number;
    avgDifficulty: number | null;
    periodLabel: string;
    progressStats: {
        completed: number;
        inProgress: number;
        inReview: number;
        todo: number;
    };
}

type PeriodFilter = 'day' | 'week' | 'month';

export default function Home() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodFilter>('week');

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/dashboard?period=${period}`);
            if (res.ok) {
                setData(await res.json());
            }
        } catch (err) {
            console.error('Error fetching dashboard:', err);
        }
        setLoading(false);
    }, [period]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <p className="text-slate-500">Failed to load dashboard data.</p>
            </div>
        );
    }

    const periodFilters: { key: PeriodFilter; label: string }[] = [
        { key: 'day', label: 'This Day' },
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
    ];

    return (
        <div className="space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
                <p className="text-slate-500">Welcome back! Here's your personal overview.</p>
            </div>

            {/* Row 1: Overview KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatsCard
                    title="Completed Tasks"
                    value={data.completedTasks}
                    icon={CheckCircle2}
                    color="emerald"
                />
                <StatsCard
                    title="Active Tasks"
                    value={data.activeTasks}
                    icon={ListTodo}
                    color="amber"
                />
                <StatsCard
                    title="Team Members"
                    value={data.teamMemberCount}
                    subtitle="Same division"
                    icon={Users}
                    color="rose"
                />
            </div>

            {/* Row 2: Personal Ticket KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-indigo-400" />
                        </div>
                        <span className="text-sm text-slate-500">Total Tickets</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{data.totalTickets}</p>
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-sm text-slate-500">Completion Rate</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{data.completionRate}%</p>
                    <p className="text-xs text-slate-500 mt-1">{data.completedTasks} of {data.totalTickets} completed</p>
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                            <Clock className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="text-sm text-slate-500">Avg Resolution Time</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{data.avgResolutionHours}h</p>
                </div>

                <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                            <Star className="w-5 h-5 text-purple-400" />
                        </div>
                        <span className="text-sm text-slate-500">Avg Difficulty</span>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{data.avgDifficulty ?? '—'}</p>
                    <p className="text-xs text-slate-500 mt-1">out of 5</p>
                </div>
            </div>

            {/* Progress Section with Filter */}
            <div className="p-6 bg-white shadow-sm border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-semibold text-slate-900">{data.periodLabel}'s Progress</h3>
                    </div>
                    <div className="flex gap-2">
                        {periodFilters.map((f) => (
                            <button
                                key={f.key}
                                onClick={() => setPeriod(f.key)}
                                className={`px-4 py-2 text-sm rounded-xl font-medium transition-all duration-200 ${
                                    period === f.key
                                        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-200/50 hover:text-slate-800'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{data.progressStats.completed}</p>
                        <p className="text-xs text-slate-500">Tasks Completed</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{data.progressStats.inProgress}</p>
                        <p className="text-xs text-slate-500">In Progress</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{data.progressStats.inReview}</p>
                        <p className="text-xs text-slate-500">In Review</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{data.progressStats.todo}</p>
                        <p className="text-xs text-slate-500">To Do</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
