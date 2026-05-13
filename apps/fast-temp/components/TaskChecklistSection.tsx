'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ListChecks, Plus, Trash2, Loader2, Lock } from 'lucide-react';

interface ChecklistItem {
    id: string;
    title: string;
    isCompleted: boolean;
    position: number;
}

interface Props {
    taskId: string;
    /** When provided, the checklist becomes editable only for the task's
     *  assignee. Everyone else gets a strictly read-only view. Pass null/
     *  undefined to allow editing for any signed-in viewer (legacy). */
    canEdit?: boolean;
    /** Called after add / toggle / delete so the parent (modal/inbox page)
     *  can refresh aggregate counts on cards. */
    onChange?: () => void;
}

export function TaskChecklistSection({ taskId, canEdit = true, onChange }: Props) {
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    // Inline-edit state — `editingId` is the item being edited; `editDraft`
    // holds the working title. We commit on blur or Enter, and revert on Esc
    // or whitespace-only input.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const editInputRef = useRef<HTMLInputElement | null>(null);

    const fetchItems = useCallback(async () => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/checklist`);
            if (res.ok) setItems(await res.json());
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const addItem = async () => {
        const title = draft.trim();
        if (!title || adding) return;
        setAdding(true);
        try {
            const res = await fetch(`/api/tasks/${taskId}/checklist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title }),
            });
            if (res.ok) {
                const created = await res.json();
                setItems((prev) => [...prev, created]);
                setDraft('');
                onChange?.();
            }
        } finally {
            setAdding(false);
        }
    };

    const toggleItem = async (item: ChecklistItem) => {
        // Optimistic — flip locally, revert on failure so the checkbox feels instant.
        const next = !item.isCompleted;
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isCompleted: next } : i)));
        try {
            const res = await fetch(`/api/tasks/${taskId}/checklist/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isCompleted: next }),
            });
            if (!res.ok) throw new Error('failed');
            onChange?.();
        } catch {
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isCompleted: item.isCompleted } : i)));
        }
    };

    const startEdit = (item: ChecklistItem) => {
        if (!canEdit) return;
        setEditingId(item.id);
        setEditDraft(item.title);
        // Focus + select-all happens on next paint when the input mounts.
        requestAnimationFrame(() => {
            editInputRef.current?.focus();
            editInputRef.current?.select();
        });
    };

    const commitEdit = async () => {
        if (!editingId) return;
        const item = items.find((i) => i.id === editingId);
        if (!item) { setEditingId(null); return; }
        const trimmed = editDraft.trim();
        // Empty / unchanged → silent cancel, no API call.
        if (!trimmed || trimmed === item.title) { setEditingId(null); return; }
        const snapshot = items;
        setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, title: trimmed } : i)));
        setEditingId(null);
        try {
            const res = await fetch(`/api/tasks/${taskId}/checklist/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: trimmed }),
            });
            if (!res.ok) throw new Error('failed');
            onChange?.();
        } catch {
            setItems(snapshot);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft('');
    };

    const deleteItem = async (itemId: string) => {
        const snapshot = items;
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        try {
            const res = await fetch(`/api/tasks/${taskId}/checklist/${itemId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('failed');
            onChange?.();
        } catch {
            setItems(snapshot);
        }
    };

    const total = items.length;
    const completed = items.filter((i) => i.isCompleted).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <section className="space-y-3">
            <header className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <ListChecks className="w-4 h-4 text-indigo-500" />
                    Checklist
                    {!canEdit && (
                        <span className="inline-flex items-center gap-1 ml-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            <Lock className="w-3 h-3" /> Read-only
                        </span>
                    )}
                </h3>
                {total > 0 && (
                    <span className="text-xs font-semibold text-slate-500">
                        {completed}/{total} · {pct}%
                    </span>
                )}
            </header>

            {total > 0 && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                </div>
            ) : (
                <ul className="space-y-1">
                    {items.map((item) => {
                        const editing = canEdit && editingId === item.id;
                        return (
                            <li key={item.id} className="group flex items-center gap-2 py-1">
                                <input
                                    type="checkbox"
                                    checked={item.isCompleted}
                                    onChange={() => toggleItem(item)}
                                    disabled={!canEdit}
                                    className={`w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                                />
                                {editing ? (
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editDraft}
                                        onChange={(e) => setEditDraft(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                            else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                        }}
                                        maxLength={200}
                                        className="flex-1 px-2 py-1 text-sm bg-white border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => startEdit(item)}
                                        disabled={!canEdit}
                                        className={`flex-1 text-left text-sm rounded px-1 py-0.5 transition-colors ${item.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'} ${canEdit ? 'hover:bg-slate-50 cursor-text' : 'cursor-default'}`}
                                    >
                                        {item.title}
                                    </button>
                                )}
                                {canEdit && !editing && (
                                    <button
                                        type="button"
                                        onClick={() => deleteItem(item.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                        aria-label="Delete checklist item"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {canEdit ? (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                        placeholder="Add a step…"
                        maxLength={200}
                        className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                        type="button"
                        onClick={addItem}
                        disabled={!draft.trim() || adding}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Add
                    </button>
                </div>
            ) : (
                !loading && total === 0 && (
                    <p className="text-xs text-slate-400 italic">No checklist items yet.</p>
                )
            )}
        </section>
    );
}
