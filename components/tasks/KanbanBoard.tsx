'use client';

import { useMemo } from 'react';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Task, TaskStatus, KANBAN_COLUMNS, STATUS_COLORS } from '@/lib/types';
import { TaskCard } from './TaskCard';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

interface KanbanColumnProps {
    id: TaskStatus;
    title: string;
    tasks: Task[];
}

function KanbanColumn({ id, title, tasks }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'flex flex-col min-h-[500px] rounded-2xl bg-slate-900/30 border transition-all duration-200',
                isOver
                    ? 'border-indigo-500/50 bg-indigo-500/5'
                    : 'border-slate-800'
            )}
        >
            {/* Column Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn('w-3 h-3 rounded-full', STATUS_COLORS[id])} />
                    <h3 className="font-semibold text-white">{title}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400">
                        {tasks.length}
                    </span>
                </div>
                <button className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Tasks */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </SortableContext>
                {tasks.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                        No tasks
                    </div>
                )}
            </div>
        </div>
    );
}

export function KanbanBoard({ projectId }: { projectId: string }) {
    const { getTasksByProject, moveTask, tasks } = useAppStore();
    const [activeTask, setActiveTask] = useState<Task | null>(null);

    const projectTasks = useMemo(() => {
        return getTasksByProject(projectId);
    }, [projectId, tasks]);

    const tasksByStatus = useMemo(() => {
        const grouped: Record<TaskStatus, Task[]> = {
            'todo': [],
            'in-progress': [],
            'review': [],
            'done': [],
        };
        projectTasks.forEach((task) => {
            grouped[task.status].push(task);
        });
        return grouped;
    }, [projectTasks]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const task = projectTasks.find((t) => t.id === event.active.id);
        if (task) setActiveTask(task);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);

        if (!over) return;

        const taskId = active.id as string;
        const overId = over.id as string;

        // Check if dropped on a column
        if (KANBAN_COLUMNS.some((col) => col.id === overId)) {
            moveTask(taskId, overId as TaskStatus);
            return;
        }

        // Check if dropped on another task
        const overTask = projectTasks.find((t) => t.id === overId);
        if (overTask) {
            moveTask(taskId, overTask.status);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {KANBAN_COLUMNS.map((column) => (
                    <KanbanColumn
                        key={column.id}
                        id={column.id}
                        title={column.title}
                        tasks={tasksByStatus[column.id]}
                    />
                ))}
            </div>
            <DragOverlay>
                {activeTask && <TaskCard task={activeTask} isDragging />}
            </DragOverlay>
        </DndContext>
    );
}
