'use client';

import { useAppStore } from '@/lib/store';
import { cn, getDaysUntilDeadline, formatDate } from '@/lib/utils';
import { Calendar, CheckCircle2, Clock, Folder, TrendingUp } from 'lucide-react';

export function ProjectCard({ projectId }: { projectId: string }) {
    const { projects, getProjectProgress, getTasksByProject, setSelectedProject, selectedProjectId } =
        useAppStore();
    const project = projects.find((p) => p.id === projectId);

    if (!project) return null;

    const progress = getProjectProgress(projectId);
    const tasks = getTasksByProject(projectId);
    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const daysUntil = getDaysUntilDeadline(project.deadline);
    const isSelected = selectedProjectId === projectId;

    return (
        <div
            onClick={() => setSelectedProject(isSelected ? null : projectId)}
            className={cn(
                'group p-5 rounded-2xl border transition-all duration-300 cursor-pointer',
                isSelected
                    ? 'bg-indigo-50/50 border-indigo-200 shadow-md shadow-indigo-100'
                    : 'bg-white border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md'
            )}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: project.color + '20' }}
                    >
                        <Folder className="w-5 h-5" style={{ color: project.color }} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {project.name}
                        </h3>
                        <p className="text-xs text-slate-500 capitalize">{project.status}</p>
                    </div>
                </div>
                <span
                    className={cn(
                        'px-2 py-1 rounded-lg text-xs font-medium',
                        project.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : project.status === 'completed'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-700'
                    )}
                >
                    {project.status}
                </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">Progress</span>
                    <span className="text-xs font-medium text-slate-900">{progress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>
                        {completedTasks}/{tasks.length} tasks
                    </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span>
                        {daysUntil !== null
                            ? daysUntil > 0
                                ? `${daysUntil}d left`
                                : daysUntil === 0
                                    ? 'Today'
                                    : 'Overdue'
                            : 'No deadline'}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function StatsCard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    color = 'indigo',
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    trend?: { value: number; positive: boolean };
    color?: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
    const colorClasses = {
        indigo: 'from-indigo-500 to-purple-600 shadow-indigo-500/25',
        emerald: 'from-emerald-500 to-teal-600 shadow-emerald-500/25',
        amber: 'from-amber-500 to-orange-600 shadow-amber-500/25',
        rose: 'from-rose-500 to-pink-600 shadow-rose-500/25',
    };

    return (
        <div className="p-5 rounded-2xl bg-white shadow-sm border border-slate-200 hover:border-slate-300 transition-all">
            <div className="flex items-start justify-between mb-4">
                <div
                    className={cn(
                        'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg',
                        colorClasses[color]
                    )}
                >
                    <Icon className="w-6 h-6 text-white" />
                </div>
                {trend && (
                    <div
                        className={cn(
                            'flex items-center gap-1 text-xs font-medium',
                            trend.positive ? 'text-emerald-400' : 'text-rose-400'
                        )}
                    >
                        <TrendingUp
                            className={cn('w-3 h-3', !trend.positive && 'rotate-180')}
                        />
                        {trend.value}%
                    </div>
                )}
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-1">{value}</h3>
            <p className="text-sm text-slate-500">{title}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
    );
}
