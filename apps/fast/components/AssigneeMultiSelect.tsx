'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface AssigneeOption {
    id: string;
    name: string;
}

interface AssigneeMultiSelectProps {
    assignees: AssigneeOption[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

// Multi-select dropdown used by Task Queue (/nexus) and Task Inbox
// (/team-inbox) to filter rows by claimer. Standalone so the same
// behaviour — searchable list, single Clear button, chip-style trigger
// label — renders identically on both surfaces. Empty selection means
// "no filter" (show all rows); a non-empty selection narrows to the
// union of the picked claimers.
//
// Includes its own outside-click handler because both consuming pages
// already wrap the dropdown in a flex/wrap row alongside other inputs
// and a Portal would have to recompute its anchor on every wrap. A
// ref-bound mousedown listener is cheaper and good enough for a
// filter chip that isn't expected to overlap modals.
export function AssigneeMultiSelect({
    assignees,
    selected,
    onChange,
    placeholder = 'All assignees',
    label,
    className = '',
}: AssigneeMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange(next);
    };

    const filtered = assignees.filter(a =>
        !search || a.name.toLowerCase().includes(search.toLowerCase()),
    );

    let triggerLabel = placeholder;
    if (selected.size === 1) {
        const only = assignees.find(a => a.id === Array.from(selected)[0]);
        triggerLabel = only?.name ?? '1 selected';
    } else if (selected.size > 1) {
        triggerLabel = `${selected.size} selected`;
    }

    return (
        <div ref={wrapRef} className={`relative ${className}`}>
            {label && (
                <span className="text-[10px] uppercase font-medium text-slate-400 mr-1.5 align-middle">
                    {label}
                </span>
            )}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 hover:border-slate-300 focus:outline-none focus:border-indigo-500"
            >
                <span className={selected.size === 0 ? 'text-slate-500' : 'font-semibold'}>
                    {triggerLabel}
                </span>
                {selected.size > 0 && (
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label="Clear selection"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(new Set());
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onChange(new Set());
                            }
                        }}
                        className="inline-flex p-0.5 text-slate-400 hover:text-rose-500 rounded"
                    >
                        <X className="w-3 h-3" />
                    </span>
                )}
                <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 min-w-[240px] bg-white border border-slate-200 rounded-lg shadow-lg max-h-[280px] overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-slate-100">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                        />
                    </div>
                    <div className="overflow-y-auto flex-1 py-1">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-400 text-center">
                                No matches
                            </div>
                        ) : (
                            filtered.map(a => {
                                const checked = selected.has(a.id);
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => toggle(a.id)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <span
                                            className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                                                checked
                                                    ? 'bg-indigo-500 border-indigo-500 text-white'
                                                    : 'border-slate-300 bg-white'
                                            }`}
                                        >
                                            {checked && <Check className="w-3 h-3" />}
                                        </span>
                                        <span className="text-slate-700 truncate">{a.name}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
