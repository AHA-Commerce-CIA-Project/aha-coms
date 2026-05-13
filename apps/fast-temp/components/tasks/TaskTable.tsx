'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Task, TaskStatus, TaskPriority, PRIORITY_COLORS, STATUS_COLORS } from '@/lib/types';
import { cn, formatDate, getInitials } from '@/lib/utils';
import {
    Check,
    ChevronDown,
    MoreHorizontal,
    RotateCw,
    Trash2,
    Edit3,
} from 'lucide-react';

interface TaskTableProps {
    projectId: string;
}

export function TaskTable({ projectId }: TaskTableProps) {
    const { getTasksByProject, tasks, users, updateTask, deleteTask, bulkUpdateTasks } =
        useAppStore();
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

    const projectTasks = useMemo(() => {
        return getTasksByProject(projectId);
    }, [projectId, tasks]);

    const toggleTaskSelection = (taskId: string) => {
        setSelectedTaskIds((prev) =>
            prev.includes(taskId)
                ? prev.filter((id) => id !== taskId)
                : [...prev, taskId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedTaskIds.length === projectTasks.length) {
            setSelectedTaskIds([]);
        } else {
            setSelectedTaskIds(projectTasks.map((t) => t.id));
        }
    };

    const handleBulkStatusChange = (status: TaskStatus) => {
        bulkUpdateTasks(selectedTaskIds, { status });
        setSelectedTaskIds([]);
        setBulkMenuOpen(false);
    };

    const handleBulkPriorityChange = (priority: TaskPriority) => {
        bulkUpdateTasks(selectedTaskIds, { priority });
        setSelectedTaskIds([]);
        setBulkMenuOpen(false);
    };

    const handleBulkDelete = () => {
        selectedTaskIds.forEach((id) => deleteTask(id));
        setSelectedTaskIds([]);
        setBulkMenuOpen(false);
    };

    return (
        <div className="rounded-2xl bg-slate-900/30 border border-slate-800 overflow-hidden">
            {/* Bulk Actions Bar */}
            {selectedTaskIds.length > 0 && (
                <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-4">
                    <span className="text-sm text-indigo-300">
                        {selectedTaskIds.length} task(s) selected
                    </span>
                    <div className="relative">
                        <button
                            onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
                            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
                        >
                            Bulk Actions
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        {bulkMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-2 border-b border-slate-700">
                                    <p className="text-xs text-slate-500 px-2 py-1">Change Status</p>
                                    {(['todo', 'in-progress', 'review', 'done'] as TaskStatus[]).map(
                                        (status) => (
                                            <button
                                                key={status}
                                                onClick={() => handleBulkStatusChange(status)}
                                                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 rounded-lg flex items-center gap-2"
                                            >
                                                <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[status])} />
                                                {status.replace('-', ' ')}
                                            </button>
                                        )
                                    )}
                                </div>
                                <div className="p-2 border-b border-slate-700">
                                    <p className="text-xs text-slate-500 px-2 py-1">Change Priority</p>
                                    {(['low', 'medium', 'high'] as TaskPriority[]).map((priority) => (
                                        <button
                                            key={priority}
                                            onClick={() => handleBulkPriorityChange(priority)}
                                            className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 rounded-lg flex items-center gap-2"
                                        >
                                            <div className={cn('w-2 h-2 rounded-full', PRIORITY_COLORS[priority])} />
                                            {priority}
                                        </button>
                                    ))}
                                </div>
                                <div className="p-2">
                                    <button
                                        onClick={handleBulkDelete}
                                        className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/20 rounded-lg flex items-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Selected
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800">
                            <th className="p-4 text-left">
                                <button
                                    onClick={toggleSelectAll}
                                    className={cn(
                                        'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                                        selectedTaskIds.length === projectTasks.length && projectTasks.length > 0
                                            ? 'bg-indigo-500 border-indigo-500'
                                            : 'border-slate-600 hover:border-slate-500'
                                    )}
                                >
                                    {selectedTaskIds.length === projectTasks.length && projectTasks.length > 0 && (
                                        <Check className="w-3 h-3 text-white" />
                                    )}
                                </button>
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Task
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Priority
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Assignee
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Due Date
                            </th>
                            <th className="p-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {projectTasks.map((task) => {
                            const assignee = users.find((u) => u.id === task.assigneeId);
                            const isSelected = selectedTaskIds.includes(task.id);

                            return (
                                <tr
                                    key={task.id}
                                    className={cn(
                                        'border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors',
                                        isSelected && 'bg-indigo-500/10'
                                    )}
                                >
                                    <td className="p-4">
                                        <button
                                            onClick={() => toggleTaskSelection(task.id)}
                                            className={cn(
                                                'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                                                isSelected
                                                    ? 'bg-indigo-500 border-indigo-500'
                                                    : 'border-slate-600 hover:border-slate-500'
                                            )}
                                        >
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </button>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-white font-medium">{task.title}</span>
                                            {task.isRecurring && (
                                                <RotateCw className="w-3 h-3 text-blue-400" />
                                            )}
                                        </div>
                                        {task.description && (
                                            <p className="text-xs text-slate-500 mt-1 truncate max-w-xs">
                                                {task.description}
                                            </p>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <span
                                            className={cn(
                                                'px-2 py-1 rounded-full text-xs font-medium capitalize',
                                                STATUS_COLORS[task.status],
                                                'bg-opacity-20 text-white'
                                            )}
                                        >
                                            {task.status.replace('-', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span
                                            className={cn(
                                                'px-2 py-1 rounded-full text-xs font-medium capitalize',
                                                PRIORITY_COLORS[task.priority],
                                                'bg-opacity-20 text-white'
                                            )}
                                        >
                                            {task.priority}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {assignee ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs text-white font-medium">
                                                    {getInitials(assignee.name)}
                                                </div>
                                                <span className="text-sm text-slate-300">{assignee.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-slate-500">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <span className="text-sm text-slate-400">
                                            {formatDate(task.dueDate)}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <button className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteTask(task.id)}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {projectTasks.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-slate-500">
                        No tasks in this project
                    </div>
                )}
            </div>
        </div>
    );
}
