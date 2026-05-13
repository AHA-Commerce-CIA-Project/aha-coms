'use client';

import { useAppStore } from '@/lib/store';
import { Task, PRIORITY_COLORS, STATUS_COLORS } from '@/lib/types';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { Calendar, GripVertical, MessageSquare, RotateCw } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskCardProps {
    task: Task;
    isDragging?: boolean;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
    const { users, setSelectedTask } = useAppStore();
    const assignee = users.find((u) => u.id === task.assigneeId);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => setSelectedTask(task.id)}
            className={cn(
                'group p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 cursor-pointer transition-all duration-200',
                isDragging && 'opacity-50 ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/20'
            )}
        >
            {/* Header */}
            <div className="flex items-start gap-2 mb-3">
                <button
                    {...attributes}
                    {...listeners}
                    className="p-1 -ml-1 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing"
                >
                    <GripVertical className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate group-hover:text-indigo-400 transition-colors">
                        {task.title}
                    </h4>
                    {task.description && (
                        <p className="text-xs text-slate-500 truncate mt-1">{task.description}</p>
                    )}
                </div>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                    className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium capitalize',
                        PRIORITY_COLORS[task.priority],
                        'bg-opacity-20 text-white'
                    )}
                >
                    {task.priority}
                </span>
                {task.isRecurring && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                        <RotateCw className="w-3 h-3" />
                        {task.recurrence}
                    </span>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {formatDate(task.dueDate)}
                </div>
                {assignee && (
                    <div
                        className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs text-white font-medium"
                        title={assignee.name}
                    >
                        {getInitials(assignee.name)}
                    </div>
                )}
            </div>
        </div>
    );
}

export function TaskCardDraggable({ task }: { task: Task }) {
    return <TaskCard task={task} />;
}
