'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Sparkles, Wrench, Bug, AlertTriangle, Pin, Plus, X, Edit3, Trash2 } from 'lucide-react';

interface Entry {
    id: string;
    version: string | null;
    title: string;
    summary: string;
    category: 'feature' | 'improvement' | 'fix' | 'breaking';
    pinned: boolean;
    publishedAt: string;
    isNew: boolean;
}

const categoryConfig: Record<string, { label: string; color: string; icon: any }> = {
    feature: { label: 'Feature', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Sparkles },
    improvement: { label: 'Improvement', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Wrench },
    fix: { label: 'Fix', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Bug },
    breaking: { label: 'Breaking', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: AlertTriangle },
};

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ChangelogPage() {
    const { isMaster } = useAuth();
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<Entry | null>(null);
    const [form, setForm] = useState({
        version: '',
        title: '',
        summary: '',
        category: 'feature' as Entry['category'],
        pinned: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/fast/api/changelog');
            if (res.ok) {
                const data = await res.json();
                setEntries(data.entries || []);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Mark as seen when the user lands on this page (after entries load)
    useEffect(() => {
        if (!loading) {
            fetch('/fast/api/changelog/mark-seen', { method: 'POST' }).catch(() => {});
        }
    }, [loading]);

    const openCreate = () => {
        setEditing(null);
        setForm({ version: '', title: '', summary: '', category: 'feature', pinned: false });
        setError('');
        setEditorOpen(true);
    };

    const openEdit = (e: Entry) => {
        setEditing(e);
        setForm({
            version: e.version || '',
            title: e.title,
            summary: e.summary,
            category: e.category,
            pinned: e.pinned,
        });
        setError('');
        setEditorOpen(true);
    };

    const submit = async () => {
        setError('');
        const plain = form.summary.replace(/<[^>]*>/g, '').trim();
        if (!form.title.trim()) { setError('Title is required'); return; }
        if (!plain) { setError('Summary is required'); return; }
        setSubmitting(true);
        try {
            const url = editing ? `/fast/api/changelog/${editing.id}` : '/fast/api/changelog';
            const method = editing ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setEditorOpen(false);
                await load();
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.error || 'Failed to save');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setSubmitting(false);
        }
    };

    const deleteEntry = async (e: Entry) => {
        if (!confirm(`Delete "${e.title}"?`)) return;
        const res = await fetch(`/fast/api/changelog/${e.id}`, { method: 'DELETE' });
        if (res.ok) await load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Changelog</h1>
                    <p className="text-slate-500">What&apos;s new, improved, and fixed in AHA COMS.</p>
                </div>
                {isMaster && (
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-full shadow-sm transition-colors text-sm"
                    >
                        <Plus className="w-4 h-4" /> New Entry
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : entries.length === 0 ? (
                <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
                    <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No changelog entries yet.</p>
                    {isMaster && <p className="text-xs text-slate-400 mt-1">Click &quot;New Entry&quot; to publish the first update.</p>}
                </div>
            ) : (
                <div className="space-y-4">
                    {entries.map((e) => {
                        const cat = categoryConfig[e.category] || categoryConfig.feature;
                        const Icon = cat.icon;
                        return (
                            <article
                                key={e.id}
                                className={`bg-white border rounded-2xl p-6 shadow-sm transition-shadow ${
                                    e.isNew ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
                                }`}
                            >
                                <header className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cat.color}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center flex-wrap gap-2 mb-1">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cat.color}`}>
                                                    {cat.label}
                                                </span>
                                                {e.version && (
                                                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">v{e.version}</span>
                                                )}
                                                {e.pinned && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                                                        <Pin className="w-3 h-3" /> Pinned
                                                    </span>
                                                )}
                                                {e.isNew && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">NEW</span>
                                                )}
                                            </div>
                                            <h2 className="text-xl font-bold text-slate-900">{e.title}</h2>
                                            <p className="text-sm text-slate-400 mt-0.5">{formatDate(e.publishedAt)}</p>
                                        </div>
                                    </div>
                                    {isMaster && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => openEdit(e)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                                title="Edit"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteEntry(e)}
                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </header>
                                <div
                                    className="text-base text-slate-700 leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1 [&_code]:bg-slate-100 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded"
                                    dangerouslySetInnerHTML={{ __html: e.summary }}
                                />
                            </article>
                        );
                    })}
                </div>
            )}

            {/* Master editor modal */}
            {editorOpen && isMaster && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => !submitting && setEditorOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">{editing ? 'Edit Entry' : 'New Changelog Entry'}</h2>
                            <button onClick={() => setEditorOpen(false)} disabled={submitting} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-sm font-medium text-slate-600">Title <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={(ev) => setForm(f => ({ ...f, title: ev.target.value }))}
                                        placeholder="e.g. Create Task directly from Nexus"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-600">Version</label>
                                    <input
                                        type="text"
                                        value={form.version}
                                        onChange={(ev) => setForm(f => ({ ...f, version: ev.target.value }))}
                                        placeholder="1.2.0"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-600">Category</label>
                                    <select
                                        value={form.category}
                                        onChange={(ev) => setForm(f => ({ ...f, category: ev.target.value as Entry['category'] }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="feature">Feature</option>
                                        <option value="improvement">Improvement</option>
                                        <option value="fix">Fix</option>
                                        <option value="breaking">Breaking</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 mt-6 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.pinned}
                                        onChange={(ev) => setForm(f => ({ ...f, pinned: ev.target.checked }))}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm text-slate-700">Pin to top</span>
                                </label>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-600">Summary <span className="text-rose-500">*</span></label>
                                <RichTextEditor
                                    value={form.summary}
                                    onChange={(html) => setForm(f => ({ ...f, summary: html }))}
                                    placeholder="What changed? Why does it matter to users?"
                                    minHeight="140px"
                                    maxHeight="300px"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm">{error}</div>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button
                                onClick={() => setEditorOpen(false)}
                                disabled={submitting}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-full disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={submitting}
                                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-sm disabled:opacity-40 transition-colors"
                            >
                                {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Publish'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
