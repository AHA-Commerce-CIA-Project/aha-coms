'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RotateCcw, Filter, Calendar } from 'lucide-react';

interface OrbitData {
    overallCompliance: number;
    compliance: Record<string, { total: number; claimed: number; completed: number }>;
    topClaimers: { name: string; image: string | null; totalClaims: number; completedClaims: number; completionRate: number }[];
    templateCompliance: { id: string; name: string; frequency: string; status: string }[];
    totalTemplates: number;
    totalClaimed: number;
}

type FilterMode = 'preset' | 'date' | 'month' | 'year';
type PresetOption = 'today' | 'week' | 'last30' | 'all';

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
        const end = new Date(year, month, 0);
        return {
            from: start.toISOString().split('T')[0],
            to: end.toISOString().split('T')[0],
            label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        };
    }

    if (mode === 'year' && customYear) {
        return { from: `${customYear}-01-01`, to: `${customYear}-12-31`, label: customYear };
    }

    return { from: null, to: null, label: 'All Time' };
}

export default function OrbitAnalyticsPage() {
    const router = useRouter();
    const { isLeader, loading: authLoading } = useAuth();
    const [data, setData] = useState<OrbitData | null>(null);
    const [loading, setLoading] = useState(true);

    const [filterMode, setFilterMode] = useState<FilterMode>('preset');
    const [preset, setPreset] = useState<PresetOption>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const dateFromRef = useRef<HTMLInputElement>(null);
    const dateToRef = useRef<HTMLInputElement>(null);
    const [customMonth, setCustomMonth] = useState('');
    const [customYear, setCustomYear] = useState('');

    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

    useEffect(() => {
        if (!authLoading && !isLeader) router.push('/orbit');
    }, [authLoading, isLeader, router]);

    const fetchData = useCallback(async () => {
        if (!isLeader) return;
        setLoading(true);
        try {
            const { from, to } = getDateRange(filterMode, preset, dateFrom, dateTo, customMonth, customYear);
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const res = await fetch(`/api/orbit/analytics?${params.toString()}`);
            if (res.ok) setData(await res.json());
        } catch {} finally {
            setLoading(false);
        }
    }, [isLeader, filterMode, preset, dateFrom, dateTo, customMonth, customYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const { label: activeLabel } = getDateRange(filterMode, preset, dateFrom, dateTo, customMonth, customYear);

    if (authLoading || !isLeader) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const freqLabels: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    const statusColors: Record<string, string> = {
        unclaimed: 'bg-slate-200',
        claimed: 'bg-indigo-500',
        completed: 'bg-emerald-500',
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-2 py-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">AHA ORBIT Analytics</h1>
                    <p className="text-sm text-slate-500">Routine task compliance and performance overview</p>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
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
                                        onClick={() => { setDateFrom(''); setDateTo(''); }}
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
                                className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
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

            {loading || !data ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Top KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                    <p className="text-sm text-slate-500">No claims in this period</p>
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
                </>
            )}
        </div>
    );
}
