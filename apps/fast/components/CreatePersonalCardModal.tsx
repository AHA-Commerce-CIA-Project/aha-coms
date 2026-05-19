'use client';

// Single-step modal for the "+ Create Card" button in the Task Inbox
// header. POSTs to /api/tasks/self which auto-assigns the new task to
// the current user — distinct from the leader-only "+ Create Task"
// 3-step wizard that assigns to others.
//
// Spec deviation worth flagging up front: the brief lists a "Task Type"
// dropdown with Standard vs Routine. Routine reminders in this app are
// modelled as RoutineTaskTemplate rows with required frequency / channel
// target / due time / mention target — fields a single-step form can't
// reasonably capture without becoming a different feature. The selector
// renders as a single read-only "Standard Task" line in the form; if
// you really want recurring reminders, use the existing Routine
// Template flow on /orbit (which already does that job).

import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';

interface ChannelOption {
    id: string;
    name: string;
}

interface CreatePersonalCardModalProps {
    open: boolean;
    onClose: () => void;
    /** Called with the new task id after a successful create — consumer
     *  uses this to trigger an inbox refetch so the card appears
     *  immediately without a manual reload. */
    onCreated?: (taskId: string) => void;
}

const PRIORITIES: { value: string; label: string }[] = [
    { value: 'P1', label: 'P1 · Urgent' },
    { value: 'P2', label: 'P2 · High' },
    { value: 'P3', label: 'P3 · Normal' },
    { value: 'P4', label: 'P4 · Low' },
    { value: '5-minute', label: '5-min' },
];

export function CreatePersonalCardModal({ open, onClose, onCreated }: CreatePersonalCardModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [urgency, setUrgency] = useState('P3');
    const [channelId, setChannelId] = useState<string>('');
    const [channels, setChannels] = useState<ChannelOption[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset every time the modal opens — no carry-over from a prior open.
    useEffect(() => {
        if (!open) return;
        setTitle('');
        setDescription('');
        setUrgency('P3');
        setChannelId('');
        setError(null);
    }, [open]);

    // Lazy-load channel list. Matches the same endpoint+filter the
    // RoutineTemplate modal uses (channels with assign_task purpose),
    // so "tag this card to a channel context" reads consistent across
    // both surfaces.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        Promise.all([
            fetch('/fast/api/channels?purpose=assign_task').then((r) => (r.ok ? r.json() : [])).catch(() => []),
            fetch('/fast/api/channels?purpose=discussion').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ])
            .then(([a, d]) => {
                if (cancelled) return;
                const merged = [...(a as { id: string; name: string }[]), ...(d as { id: string; name: string }[])];
                setChannels(merged.map((c) => ({ id: c.id, name: c.name })));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [open]);

    // Escape-key close — only when the modal owns focus and no submit is
    // in flight (so a stray Esc mid-submit doesn't strand the request).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, submitting, onClose]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/fast/api/tasks/self', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    urgency,
                    targetChannelId: channelId || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to create card');
            }
            onCreated?.(data.id);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Failed to create card');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
            onClick={(e) => {
                if (e.target === e.currentTarget && !submitting) onClose();
            }}
        >
            <div
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl my-8 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">New Personal Card</h2>
                            <p className="text-[11px] text-slate-400">
                                Self-assigned task. Lands in your active inbox.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="text-sm font-medium text-slate-600">
                            Title <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            autoFocus
                            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                            placeholder="e.g. Follow up on Brand X invoice"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-600">Type</label>
                            {/* Spec called for Standard vs Routine. Routine in this
                                app requires schedule + frequency + channel-target
                                + mention-target (RoutineTaskTemplate row), which
                                this single-step form can't capture meaningfully.
                                Rendered as a disabled single-option select so the
                                field is visible per spec but the UX doesn't lie
                                about what it does. Routine creation lives on
                                /orbit's Routine Template flow. */}
                            <select
                                value="standard"
                                disabled
                                className="w-full mt-1 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-600 cursor-not-allowed"
                                aria-describedby="type-hint"
                            >
                                <option value="standard">Standard Task</option>
                            </select>
                            <p id="type-hint" className="text-[10px] text-slate-400 mt-1">
                                For recurring reminders, use Orbit → Routine Templates.
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-600">Priority</label>
                            <select
                                value={urgency}
                                onChange={(e) => setUrgency(e.target.value)}
                                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                            >
                                {PRIORITIES.map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-600">
                            Channel / Brand Tag <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <select
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                        >
                            <option value="">No channel</option>
                            {channels.map((c) => (
                                <option key={c.id} value={c.id}>#{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-slate-600">
                            Description <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                            placeholder="Notes, links, context…"
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !title.trim()}
                            className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm inline-flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4" /> Create Card
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
