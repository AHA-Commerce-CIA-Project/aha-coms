'use client';

// Left-pane index for the "Later" view of the unified Messages workspace.
// Shows the three Later sub-tabs (Saved messages, Saved tasks, Posted cards)
// as primary items — when this index is rendered, the right pane is showing
// LaterPane and the user is fully inside the Later mode.

import { Bookmark, ListTodo, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS: { tab: 'messages' | 'tasks' | 'posted-cards'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { tab: 'messages', label: 'Saved messages', icon: Bookmark },
    { tab: 'tasks', label: 'Saved tasks', icon: ListTodo },
    { tab: 'posted-cards', label: 'Posted cards', icon: Send },
];

interface LaterIndexProps {
    activeTab: 'messages' | 'tasks' | 'posted-cards';
    onSelect: (tab: 'messages' | 'tasks' | 'posted-cards') => void;
}

export function LaterIndex({ activeTab, onSelect }: LaterIndexProps) {
    return (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-800">Later</h2>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                <div className="space-y-0.5">
                    {ITEMS.map((it) => {
                        const Icon = it.icon;
                        const active = activeTab === it.tab;
                        return (
                            <button
                                key={it.tab}
                                type="button"
                                onClick={() => onSelect(it.tab)}
                                className={cn(
                                    'flex items-center gap-2 w-full px-4 py-2 text-sm transition-colors',
                                    active ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100',
                                )}
                            >
                                <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-slate-400')} />
                                <span className="flex-1 truncate text-left">{it.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
