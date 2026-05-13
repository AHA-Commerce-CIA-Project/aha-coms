'use client';

import { useState, useEffect } from 'react';
import { Search, ArrowLeft, Clock, CheckCircle2, Loader2, Star, MessageSquare, Send, FileText, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TaskCommentsSection } from '@/components/TaskCommentsSection';
import { ImageLightbox } from '@/components/ImageLightbox';
import { sanitizeRichText } from '@/lib/sanitize';

interface ReviewData {
    rating: number;
    comment: string | null;
    reviewer_name: string | null;
    created_at: string;
}

interface TaskData {
    id: string;
    task_token: string;
    title: string;
    description: string | null;
    status: string;
    urgency: string | null;
    request_type: string | null;
    requester_name: string | null;
    requester_email: string | null;
    requester_division: string | null;
    assignee_name: string | null;
    created_at: string;
    completed_at: string | null;
    due_date: string | null;
    feedback_notes: string | null;
    resolution_summary: string | null;
    difficulty_score: number | null;
    image_url: string | null;
    custom_fields?: { fileUrls?: string[]; referenceUrls?: string[] };
    requester_review: ReviewData | null;
    completer_review: ReviewData | null;
    pending_reason?: string | null;
    pending_tag?: string | null;
    pended_at?: string | null;
}

const STEPS = ['Submitted', 'Acknowledged', 'In Progress', 'Completed'];

function getStepIndex(status: string): number {
    if (status === 'done') return 3;
    if (status === 'in-progress') return 2;
    if (status === 'review') return 2;
    // Paused tasks visually sit at the In Progress step — they aren't going
    // backwards, just waiting on something external.
    if (status === 'pending') return 2;
    if (status === 'todo') return 0;
    return 1;
}

const urgencyLabels: Record<string, string> = {
    'P1': 'P1', 'P2': 'P2', 'P3': 'P3', 'P4': 'P4', '5-minute': '5min',
};

const statusLabels: Record<string, string> = {
    'todo': 'New', 'in-progress': 'In Progress', 'review': 'In Review', 'done': 'Completed',
    'pending': 'On Hold',
    'pending_completion_details': 'Pending',
};

const statusColors: Record<string, string> = {
    'todo': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    'in-progress': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    'review': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'done': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'pending': 'bg-amber-500/20 text-amber-700 border-amber-500/30',
    'pending_completion_details': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const PENDING_TAG_LABEL: Record<string, string> = {
    waiting_on_brand: 'Waiting on brand',
    waiting_on_partner: 'Waiting on partner',
    waiting_on_internal: 'Waiting on internal team',
    waiting_on_user: 'Waiting on requester',
    other: 'Other',
};

function StarRating({ rating, onRate, readonly = false }: {
    rating: number;
    onRate?: (r: number) => void;
    readonly?: boolean;
}) {
    const [hovered, setHovered] = useState(0);

    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={readonly}
                    onClick={() => onRate?.(star)}
                    onMouseEnter={() => !readonly && setHovered(star)}
                    onMouseLeave={() => !readonly && setHovered(0)}
                    className={`transition-all ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
                >
                    <Star
                        className={`w-7 h-7 transition-colors ${
                            star <= (hovered || rating)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300'
                        }`}
                    />
                </button>
            ))}
        </div>
    );
}

function ReviewDisplay({ review, label }: { review: ReviewData; label: string }) {
    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                <span className="text-xs text-slate-400">
                    {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
                <StarRating rating={review.rating} readonly />
                <span className="text-sm font-medium text-slate-700">{review.rating}/5</span>
            </div>
            {review.comment && (
                <p className="text-sm text-slate-600 mt-2">{review.comment}</p>
            )}
            {review.reviewer_name && (
                <p className="text-xs text-slate-400 mt-2">- {review.reviewer_name}</p>
            )}
        </div>
    );
}

function TrackContent() {
    const searchParams = useSearchParams();
    const [token, setToken] = useState(searchParams.get('token') || '');
    const [task, setTask] = useState<TaskData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Review form state
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewEmail, setReviewEmail] = useState('');
    const [reviewSubmitting, setReviewSubmitting] = useState(false);
    const [reviewError, setReviewError] = useState<string | null>(null);
    const [reviewSuccess, setReviewSuccess] = useState(false);

    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Comments state
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    // Dispute pause flow — requester can resume a paused task themselves and
    // leave an optional note explaining why they think the pause is unjustified.
    const [disputeOpen, setDisputeOpen] = useState(false);
    const [disputeComment, setDisputeComment] = useState('');
    const [disputeSubmitting, setDisputeSubmitting] = useState(false);
    const [disputeError, setDisputeError] = useState<string | null>(null);

    const fetchComments = async (taskId: string, taskToken: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/comments?token=${taskToken}`);
            if (res.ok) setComments(await res.json());
        } catch {}
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !task) return;
        setCommentSubmitting(true);
        try {
            const res = await fetch(`/api/tasks/${task.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: commentText.trim(),
                    token: task.task_token,
                    authorName: task.requester_name || 'Requester',
                    authorEmail: task.requester_email || undefined,
                }),
            });
            if (res.ok) {
                setCommentText('');
                fetchComments(task.id, task.task_token);
            }
        } catch {}
        setCommentSubmitting(false);
    };

    // Get requester initials
    const getInitials = (name: string | null) => {
        if (!name) return 'R';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0][0].toUpperCase();
    };

    useEffect(() => {
        const t = searchParams.get('token');
        if (t) {
            setToken(t);
            lookupTask(t);
        }
    }, [searchParams]);

    const lookupTask = async (t?: string) => {
        const searchToken = (t || token).trim();
        if (!searchToken) return;

        // Easter egg: typing "WEREWOLF" sends the user to the WEREWOLF web app.
        if (searchToken.toUpperCase() === 'WEREWOLF') {
            window.location.href = 'https://werewolf-web-908739514002.asia-southeast2.run.app/';
            return;
        }

        setLoading(true);
        setError(null);
        setTask(null);
        setShowReviewForm(false);
        setReviewSuccess(false);

        try {
            const res = await fetch(`/api/request?token=${encodeURIComponent(searchToken)}`);
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.message || 'Request not found');
            setTask(json.data);
            // Fetch comments
            if (json.data?.id && json.data?.task_token) {
                fetchComments(json.data.id, json.data.task_token);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to find request');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        lookupTask();
    };

    const handleDispute = async () => {
        if (!task || disputeSubmitting) return;
        setDisputeSubmitting(true);
        setDisputeError(null);
        try {
            const res = await fetch('/api/request/dispute-pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: task.task_token,
                    comment: disputeComment.trim(),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || data?.message || 'Failed to dispute pause');
            }
            // Optimistic local state — the badge clears + the dispute modal closes.
            setTask(prev => prev ? {
                ...prev,
                status: data?.data?.status || 'in-progress',
                pending_reason: null,
                pending_tag: null,
                pended_at: null,
            } : prev);
            setDisputeOpen(false);
            setDisputeComment('');
            // Refresh comments so the system note appears.
            if (task.id && task.task_token) {
                fetchComments(task.id, task.task_token);
            }
        } catch (err: any) {
            setDisputeError(err?.message || 'Failed to dispute pause');
        } finally {
            setDisputeSubmitting(false);
        }
    };

    const handleReviewSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!task || reviewRating === 0) return;

        setReviewSubmitting(true);
        setReviewError(null);

        try {
            const res = await fetch(`/api/tasks/${task.id}/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviewerType: 'requester',
                    rating: reviewRating,
                    comment: reviewComment || undefined,
                    reviewerEmail: reviewEmail,
                    taskToken: task.task_token,
                }),
            });

            const json = await res.json();
            if (json.status !== 'success') {
                throw new Error(json.message || 'Failed to submit review');
            }

            setReviewSuccess(true);
            setShowReviewForm(false);
            // Refresh task data to show the new review
            lookupTask(task.task_token);
        } catch (err: any) {
            setReviewError(err.message || 'Failed to submit review');
        } finally {
            setReviewSubmitting(false);
        }
    };

    const getDaysOpen = (createdAt: string) => {
        const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
        return days < 1 ? 'Today' : `${days} days`;
    };

    const stepIndex = task ? getStepIndex(task.status) : 0;

    return (
        <div className="min-h-screen bg-slate-50 border-slate-200 text-slate-800 p-4 md:p-8 flex justify-center">
            <div className="w-full max-w-2xl">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                            <img src="/aha-logo.png?v=2" alt="AHA Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Check Your Request Status</h1>
                            <p className="text-slate-500 text-sm">Enter the Task Token that we've send before</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/request" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
                            Submit Request
                        </Link>
                        <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                            FAST Login &rarr;
                        </Link>
                    </div>
                </div>

                {/* Search */}
                <form onSubmit={handleSubmit} className="mb-8">
                    <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                value={token}
                                onChange={(e) => setToken(e.target.value.toUpperCase())}
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border-slate-200 border border-slate-200 rounded-xl text-slate-900 font-mono text-lg tracking-wider placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                placeholder="T-0042"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !token.trim()}
                            className="px-6 py-3.5 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-all whitespace-nowrap"
                        >
                            {loading ? 'Searching...' : 'Check Status'}
                        </button>
                    </div>
                </form>

                {error && (
                    <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
                        <p className="text-slate-500">Looking up your request...</p>
                    </div>
                )}

                {/* Task Result */}
                {task && (
                    <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                        {/* Task Header */}
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-start justify-between mb-3">
                                <span className="font-mono text-slate-500 text-sm">{task.task_token}</span>
                                <span className={`px-3 py-1 rounded-lg text-xs font-medium border ${statusColors[task.status] || statusColors['todo']}`}>
                                    {statusLabels[task.status] || task.status}
                                </span>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900 mb-4">{task.title}</h2>
                            {/* Top-level metadata grid — mirrors the internal Task Details modal so
                                requesters see the same context (requester, division, type, status,
                                priority, assignee, submitted timestamp) that the FAST team sees. */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                                <div>
                                    <p className="text-slate-500 text-xs">Requester</p>
                                    <p className="text-slate-900 font-medium truncate">{task.requester_name || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Division</p>
                                    <p className="text-slate-900 font-medium truncate">{task.requester_division || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Priority</p>
                                    <p className="text-slate-900 font-medium">{urgencyLabels[task.urgency || 'P3'] || task.urgency}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Status</p>
                                    <p className="text-slate-900 font-medium">{statusLabels[task.status] || task.status}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Assigned To</p>
                                    <p className="text-slate-900 font-medium truncate">{task.assignee_name || 'Pending'}</p>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-xs">Submitted</p>
                                    <p className="text-slate-900 font-medium">
                                        {new Date(task.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                {task.due_date && (
                                    <div>
                                        <p className="text-slate-500 text-xs">Due</p>
                                        <p className="text-slate-900 font-medium">
                                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pending callout — visible to the requester when their task is
                            paused. Surfaces the structured tag + assignee's free-text
                            reason so they can chase the blocker on their side instead
                            of assuming the request was forgotten.

                            Includes a Dispute & Resume affordance: if the requester thinks
                            the pause is unjustified, they can resume the task themselves
                            and leave a comment explaining why. The action posts a system
                            comment + notifies the assignee. */}
                        {task.status === 'pending' && (task.pending_reason || task.pending_tag) && (
                            <div className="p-6 border-b border-slate-200">
                                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-4 h-4 text-amber-700" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-amber-900">
                                            On hold
                                            {task.pending_tag && PENDING_TAG_LABEL[task.pending_tag]
                                                ? ` — ${PENDING_TAG_LABEL[task.pending_tag]}`
                                                : ''}
                                        </p>
                                        {task.pending_reason && (
                                            <p className="text-sm text-amber-800 mt-1 leading-relaxed whitespace-pre-wrap">
                                                {task.pending_reason}
                                            </p>
                                        )}
                                        {task.pended_at && (
                                            <p className="text-[11px] text-amber-700 mt-2">
                                                Paused {new Date(task.pended_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </p>
                                        )}
                                        <div className="mt-3">
                                            <button
                                                type="button"
                                                onClick={() => setDisputeOpen(true)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-full transition-colors"
                                            >
                                                Dispute &amp; Resume
                                            </button>
                                            <span className="ml-2 text-[11px] text-amber-700">
                                                Disagree with this pause? You can resume the task and leave a note.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Description — same prose styling and HTML sanitisation as the
                            internal modal so requesters see the request body they wrote. */}
                        {task.description && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Description</h3>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div
                                        className="prose prose-sm max-w-none text-sm text-slate-800 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:bg-slate-100 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline"
                                        dangerouslySetInnerHTML={{ __html: sanitizeRichText(task.description) }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Progress Stepper */}
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-center justify-between">
                                {STEPS.map((step, i) => (
                                    <div key={step} className="flex items-center flex-1">
                                        <div className="flex flex-col items-center">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                                i <= stepIndex
                                                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                                                    : 'bg-slate-100 text-slate-500 border border-slate-300'
                                            }`}>
                                                {i < stepIndex ? <CheckCircle2 className="w-5 h-5" /> :
                                                 i === stepIndex ? <Clock className="w-5 h-5" /> :
                                                 i + 1}
                                            </div>
                                            <p className={`mt-2 text-xs font-medium ${i <= stepIndex ? 'text-indigo-400' : 'text-slate-600'}`}>
                                                {step}
                                            </p>
                                        </div>
                                        {i < STEPS.length - 1 && (
                                            <div className={`flex-1 h-0.5 mx-2 mt-[-16px] ${i < stepIndex ? 'bg-indigo-500' : 'bg-slate-100'}`} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Attached Image */}
                        {task.image_url && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Attached Image</h3>
                                <button
                                    type="button"
                                    onClick={() => setLightboxUrl(task.image_url)}
                                    className="block w-full"
                                >
                                    <img
                                        src={task.image_url}
                                        alt="Request attachment"
                                        className="w-full max-h-72 object-contain rounded-xl border border-slate-300 bg-slate-50 border-slate-200 hover:opacity-90 transition-opacity cursor-zoom-in"
                                    />
                                </button>
                            </div>
                        )}

                        {/* Attached Files */}
                        {task.custom_fields?.fileUrls && task.custom_fields.fileUrls.length > 0 && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Attached Files</h3>
                                <div className="space-y-1.5">
                                    {task.custom_fields.fileUrls.map((url: string, i: number) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                            <span className="truncate">{decodeURIComponent(url.split('/').pop() || url)}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reference URLs */}
                        {task.custom_fields?.referenceUrls && task.custom_fields.referenceUrls.length > 0 && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Reference Links</h3>
                                <div className="space-y-1.5">
                                    {task.custom_fields.referenceUrls.map((url: string, i: number) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-100 transition-colors">
                                            <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                            <span className="truncate">{url}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Latest Update / FAST Feedback */}
                        {(task.resolution_summary || task.feedback_notes) && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-2">Latest Update</h3>
                                <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 text-sm text-slate-700">
                                    {task.resolution_summary || task.feedback_notes}
                                </div>
                            </div>
                        )}

                        {/* Existing Reviews */}
                        {(task.requester_review || task.completer_review) && (
                            <div className="p-6 border-b border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-3">Reviews</h3>
                                <div className="space-y-3">
                                    {task.completer_review && (
                                        <ReviewDisplay review={task.completer_review} label="Review from FAST Team" />
                                    )}
                                    {task.requester_review && (
                                        <ReviewDisplay review={task.requester_review} label="Your Review" />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Review Form — only for completed tasks without a requester review */}
                        {task.status === 'done' && !task.requester_review && !reviewSuccess && (
                            <div className="p-6 border-b border-slate-200">
                                {!showReviewForm ? (
                                    <button
                                        onClick={() => setShowReviewForm(true)}
                                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
                                    >
                                        <Star className="w-5 h-5" />
                                        Rate This Service
                                    </button>
                                ) : (
                                    <form onSubmit={handleReviewSubmit} className="space-y-4">
                                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                            <Star className="w-4 h-4 text-amber-400" />
                                            Rate Your Experience
                                        </h3>

                                        {/* Email verification */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-500">
                                                Your Email (for verification)
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={reviewEmail}
                                                onChange={(e) => setReviewEmail(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                                placeholder="Enter the email you used when submitting the request"
                                            />
                                        </div>

                                        {/* Star Rating */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-500">Rating</label>
                                            <StarRating rating={reviewRating} onRate={setReviewRating} />
                                            {reviewRating === 0 && (
                                                <p className="text-xs text-slate-400">Click a star to rate</p>
                                            )}
                                        </div>

                                        {/* Comment */}
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                                <MessageSquare className="w-3 h-3" /> Comment (optional)
                                            </label>
                                            <textarea
                                                value={reviewComment}
                                                onChange={(e) => setReviewComment(e.target.value)}
                                                rows={3}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                                                placeholder="Share your feedback about how this request was handled..."
                                            />
                                        </div>

                                        {reviewError && (
                                            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 text-xs">
                                                {reviewError}
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <button
                                                type="submit"
                                                disabled={reviewSubmitting || reviewRating === 0}
                                                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                            >
                                                {reviewSubmitting ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Send className="w-4 h-4" />
                                                )}
                                                {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowReviewForm(false);
                                                    setReviewError(null);
                                                }}
                                                className="px-4 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}

                        {/* Review success message */}
                        {reviewSuccess && !task.requester_review && (
                            <div className="p-6 border-b border-slate-200">
                                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                    <p className="text-sm text-emerald-700 font-medium">
                                        Thank you for your review! Your feedback helps us improve.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Comments Section */}
                        <div className="p-6 border-b border-slate-200">
                            <p className="text-xs text-slate-400 mb-2">
                                Commenting as <strong className="text-slate-600">{task?.requester_name || 'Requester'}</strong>
                            </p>
                            <TaskCommentsSection
                                key={task?.id}
                                taskId={task!.id}
                                token={task?.task_token}
                                requesterName={task?.requester_name || undefined}
                                requesterEmail={task?.requester_email || undefined}
                                size="regular"
                            />
                        </div>

                        {/* Footer */}
                        <div className="p-6">
                            <Link
                                href="/request"
                                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Submit Another Request
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            {/* Image lightbox — closes on ESC (document-level listener) and backdrop click */}
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

            {/* Dispute pause modal — requester resumes the task and leaves an
                optional note. The note is appended as a system comment so the
                assignee + audit trail capture WHY the pause was disputed. */}
            {disputeOpen && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => !disputeSubmitting && setDisputeOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200">
                            <h3 className="text-base font-bold text-slate-900">Dispute pause &amp; resume</h3>
                            <p className="text-[11px] text-slate-500 mt-1">
                                The task will go back to active and the assignee will be notified.
                            </p>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">
                                    Why are you disputing this pause? <span className="text-slate-400 font-normal">(optional)</span>
                                </label>
                                <textarea
                                    value={disputeComment}
                                    onChange={(e) => setDisputeComment(e.target.value)}
                                    rows={3}
                                    placeholder="e.g. The brand already confirmed the price last week — this shouldn't be on hold."
                                    autoFocus
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>
                            {disputeError && (
                                <p className="text-xs text-rose-600">{disputeError}</p>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setDisputeOpen(false)}
                                disabled={disputeSubmitting}
                                className="px-4 py-2 text-sm text-slate-600 rounded-full hover:bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDispute}
                                disabled={disputeSubmitting}
                                className="px-5 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-full disabled:opacity-40"
                            >
                                {disputeSubmitting ? 'Resuming…' : 'Dispute & Resume'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function TrackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 border-slate-200 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
        }>
            <TrackContent />
        </Suspense>
    );
}
