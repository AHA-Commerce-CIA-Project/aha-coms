'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/lib/auth/use-auth';
import { useAuth } from '@/lib/auth/use-auth';
import {
    Trophy, Award, Plus, Pencil, Trash2, X, ArrowLeft,
    CheckCircle2, Repeat, Crown, Lock,
} from 'lucide-react';

interface Milestone {
    id: string;
    type: 'recurring' | 'first';
    threshold: number;
    rewardLabel: string;
    description: string | null;
    emoji: string | null;
    active: boolean;
    createdAt: string;
    createdBy: { id: string; name: string } | null;
    claimedBy: { id: string; name: string; image: string | null } | null;
    claimedAt: string | null;
    myProgress: {
        doneCount: number;
        reachedTimes: number;
        isClaimedByMe: boolean;
        progressPercent: number;
    };
}

export default function MilestonesPage() {
    const router = useRouter();
    const { data: session, isPending } = useSession();
    const { isLeader } = useAuth();

    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [myDoneCount, setMyDoneCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Form state (leader-only)
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [type, setType] = useState<'recurring' | 'first'>('recurring');
    const [threshold, setThreshold] = useState<number | ''>(10);
    const [rewardLabel, setRewardLabel] = useState('');
    const [description, setDescription] = useState('');
    const [emoji, setEmoji] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (!isPending && !session) router.push('/login');
    }, [session, isPending, router]);

    useEffect(() => {
        if (session) fetchMilestones();
    }, [session]);

    const fetchMilestones = async () => {
        try {
            const res = await fetch('/api/orbit/milestones');
            if (res.ok) {
                const data = await res.json();
                setMilestones(data.milestones || []);
                setMyDoneCount(data.myDoneCount || 0);
            }
        } catch {}
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setEditId(null);
        setType('recurring');
        setThreshold(10);
        setRewardLabel('');
        setDescription('');
        setEmoji('');
        setFormError('');
    };

    const openCreateForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = (m: Milestone) => {
        setEditId(m.id);
        setType(m.type);
        setThreshold(m.threshold);
        setRewardLabel(m.rewardLabel);
        setDescription(m.description || '');
        setEmoji(m.emoji || '');
        setFormError('');
        setShowForm(true);
    };

    const handleSubmit = async () => {
        setFormError('');
        if (!rewardLabel.trim()) { setFormError('Reward label is required'); return; }
        const t = Number(threshold);
        if (!Number.isFinite(t) || t < 1) { setFormError('Threshold must be at least 1'); return; }

        setSaving(true);
        try {
            const url = editId ? `/api/orbit/milestones/${editId}` : '/api/orbit/milestones';
            const method = editId ? 'PATCH' : 'POST';
            const body: Record<string, unknown> = {
                threshold: t,
                rewardLabel: rewardLabel.trim(),
                description: description.trim() || null,
                emoji: emoji.trim() || null,
            };
            if (!editId) body.type = type;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setFormError(data.error || 'Failed to save');
                setSaving(false);
                return;
            }
            setShowForm(false);
            resetForm();
            await fetchMilestones();
        } catch {
            setFormError('Failed to save');
        }
        setSaving(false);
    };

    const handleDelete = async (m: Milestone) => {
        if (!confirm(`Delete the "${m.rewardLabel}" milestone? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/orbit/milestones/${m.id}`, { method: 'DELETE' });
            if (res.ok) await fetchMilestones();
        } catch {}
    };

    if (isPending || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    if (!session) return null;

    const recurring = milestones.filter(m => m.type === 'recurring');
    const firstReach = milestones.filter(m => m.type === 'first');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <Link href="/analytics" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-2">
                        <ArrowLeft className="w-4 h-4" /> Back to Analytics
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-amber-500" /> Milestones
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Earn rewards as you complete tasks. {myDoneCount > 0 && (
                            <span className="font-semibold text-slate-700">
                                You&apos;ve completed {myDoneCount} task{myDoneCount === 1 ? '' : 's'}.
                            </span>
                        )}
                    </p>
                </div>
                {isLeader && (
                    <button
                        onClick={openCreateForm}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" /> New milestone
                    </button>
                )}
            </div>

            {milestones.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                    <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">No milestones yet</p>
                    <p className="text-xs text-slate-500 mt-1">
                        {isLeader ? 'Click "New milestone" to set up your first one.' : 'Check back soon — your leaders will set them up.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Recurring milestones */}
                    {recurring.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <Repeat className="w-4 h-4 text-emerald-600" />
                                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Milestone Reached</h2>
                                <span className="text-xs text-slate-400">Earn it every time you hit the threshold</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {recurring.map((m) => (
                                    <MilestoneCard
                                        key={m.id}
                                        m={m}
                                        canManage={isLeader}
                                        onEdit={() => openEditForm(m)}
                                        onDelete={() => handleDelete(m)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* First-to-reach milestones */}
                    {firstReach.length > 0 && (
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <Crown className="w-4 h-4 text-amber-500" />
                                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">First Completion Reward</h2>
                                <span className="text-xs text-slate-400">Locked to whoever reaches the threshold first</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {firstReach.map((m) => (
                                    <MilestoneCard
                                        key={m.id}
                                        m={m}
                                        canManage={isLeader}
                                        onEdit={() => openEditForm(m)}
                                        onDelete={() => handleDelete(m)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* Form modal */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {editId ? 'Edit milestone' : 'New milestone'}
                            </h2>
                            <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            {!editId && (
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-700 font-medium">Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setType('recurring')}
                                            className={`p-3 rounded-xl border text-left transition-all ${
                                                type === 'recurring'
                                                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                                <Repeat className="w-4 h-4 text-emerald-600" /> Milestone Reached
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Every X completions → reward Y. Anyone who reaches it earns it, every time.
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setType('first')}
                                            className={`p-3 rounded-xl border text-left transition-all ${
                                                type === 'first'
                                                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                                <Crown className="w-4 h-4 text-amber-500" /> First Completion
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                First to hit X → reward Z. Locked to the first claimer.
                                            </p>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-sm text-slate-700 font-medium">Threshold (X)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={threshold}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setThreshold(v === '' ? '' : Number(v));
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[11px] text-slate-400">Number of completed tasks to trigger this milestone.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-700 font-medium">Emoji</label>
                                    <input
                                        type="text"
                                        value={emoji}
                                        onChange={(e) => setEmoji(e.target.value.slice(0, 10))}
                                        placeholder="🏆"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 text-center"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-700 font-medium">Reward (Y / Z)</label>
                                <input
                                    type="text"
                                    value={rewardLabel}
                                    onChange={(e) => setRewardLabel(e.target.value)}
                                    placeholder="e.g. Free coffee voucher, Bonus day off"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-700 font-medium">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Any extra context — how to claim, expiry, etc."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>

                            {formError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">{formError}</div>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 rounded-b-2xl">
                            <button
                                onClick={() => { setShowForm(false); resetForm(); }}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Saving…' : editId ? 'Save changes' : 'Create milestone'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MilestoneCard({
    m, canManage, onEdit, onDelete,
}: {
    m: Milestone;
    canManage: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const isFirst = m.type === 'first';
    const accent = isFirst ? 'amber' : 'emerald';
    const accentBg = isFirst ? 'bg-amber-50' : 'bg-emerald-50';
    const accentBorder = isFirst ? 'border-amber-200' : 'border-emerald-200';
    const claimedByMe = m.myProgress.isClaimedByMe;

    // For "first": fully claimed by someone (could be you).
    // For "recurring": never fully "locked" — shows progress toward next tier.
    const reachedTimes = m.myProgress.reachedTimes;
    const remainder = m.myProgress.doneCount - reachedTimes * m.threshold;
    const nextTierProgress = m.threshold > 0 ? Math.min(100, Math.round((remainder / m.threshold) * 100)) : 0;

    return (
        <div className={`relative bg-white border ${accentBorder} rounded-2xl p-5 shadow-sm`}>
            {canManage && (
                <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                        onClick={onEdit}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl ${accentBg} flex items-center justify-center text-2xl flex-shrink-0`}>
                    {m.emoji || (isFirst ? '👑' : '🏆')}
                </div>
                <div className="flex-1 min-w-0 pr-12">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                        {isFirst ? (
                            <span className="text-amber-600 inline-flex items-center gap-1"><Crown className="w-3 h-3" /> First to reach {m.threshold}</span>
                        ) : (
                            <span className="text-emerald-600 inline-flex items-center gap-1"><Repeat className="w-3 h-3" /> Every {m.threshold}</span>
                        )}
                    </div>
                    <p className="text-base font-bold text-slate-900 mt-0.5 truncate">{m.rewardLabel}</p>
                    {m.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.description}</p>
                    )}
                </div>
            </div>

            {/* Progress / claim state */}
            <div className="mt-4 pt-4 border-t border-slate-100">
                {isFirst ? (
                    m.claimedBy ? (
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold overflow-hidden">
                                {m.claimedBy.image ? <img src={m.claimedBy.image} alt="" className="w-8 h-8 rounded-full object-cover" /> : m.claimedBy.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-slate-400" />
                                    Won by {claimedByMe ? 'you' : m.claimedBy.name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    {m.claimedAt ? new Date(m.claimedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                </p>
                            </div>
                            {claimedByMe && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">YOU</span>}
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                                <span>Your progress</span>
                                <span className="font-semibold text-slate-700">{m.myProgress.doneCount} / {m.threshold}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full bg-${accent}-500`}
                                    style={{ width: `${m.myProgress.progressPercent}%` }}
                                />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1.5">Unclaimed — race to be the first.</p>
                        </div>
                    )
                ) : (
                    <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                            <span>{reachedTimes > 0 ? `Reached ${reachedTimes}× — next tier` : 'Your progress'}</span>
                            <span className="font-semibold text-slate-700">{remainder} / {m.threshold}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${nextTierProgress}%` }}
                            />
                        </div>
                        {reachedTimes > 0 && (
                            <p className="text-[11px] text-emerald-600 font-medium mt-1.5 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Earned {reachedTimes}×
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
