'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    X,
    CheckCircle2,
    Loader2,
    Calendar,
    User as UserIcon,
    Hash,
    Paperclip,
    Mail,
    Building2,
    ExternalLink,
    File as FileIcon,
} from 'lucide-react';
import { sanitizeRichText } from '@/lib/sanitize';
import { ImageLightbox } from './ImageLightbox';
import { TaskCommentsSection } from './TaskCommentsSection';
import { SaveTaskButton } from './SaveTaskButton';

interface Attachment {
    url: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
}

export interface TeamInboxTask {
    id: string;
    title: string;
    description: string | null;
    urgency: string | null;
    status: string;
    attachments: Attachment[];
    dueDate: string | null;
    createdAt: string;
    claimedAt: string | null;
    completedAt: string | null;
    requesterName: string | null;
    requesterEmail: string | null;
    requesterDivision: string | null;
    targetChannel: { id: string; name: string } | null;
    assignee: { id: string; name: string; image: string | null } | null;
    assignedTeam: { id: string; name: string } | null;
    taskToken: string | null;
}

interface Props {
    task: TeamInboxTask;
    /** Authenticated user — needed for comment edit-permissions and the Save button. */
    currentUserId?: string;
    onClose: () => void;
    onChange: () => void;
}

const PRIORITY_TONE: Record<string, { bg: string; text: string; border: string; label: string }> = {
    P1: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'P1 · Urgent' },
    P2: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'P2 · High' },
    P3: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', label: 'P3 · Normal' },
    P4: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', label: 'P4 · Low' },
    '5-minute': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', label: '5-min' },
};

const STATUS_TONE: Record<string, { label: string; bg: string; text: string }> = {
    todo: { label: 'New', bg: 'bg-sky-50', text: 'text-sky-700' },
    'in-progress': { label: 'In Progress', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    review: { label: 'In Review', bg: 'bg-violet-50', text: 'text-violet-700' },
    pending_completion_details: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700' },
    done: { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TeamInboxTaskModal({ task, currentUserId, onClose, onChange }: Props) {
    const router = useRouter();
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const tone = (task.urgency && PRIORITY_TONE[task.urgency]) || PRIORITY_TONE.P3;
    const status = STATUS_TONE[task.status] || { label: task.status, bg: 'bg-slate-50', text: 'text-slate-700' };
    const isClaimed = !!task.assignee && task.status !== 'todo';
    const sanitizedDescription = task.description ? sanitizeRichText(task.description) : '';
    const attachments = Array.isArray(task.attachments) ? task.attachments : [];

    const handleClaim = async () => {
        setClaiming(true);
        setError(null);
        try {
            const res = await fetch(`/api/tasks/${task.id}/claim`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data?.error || 'Failed to claim task');
                return;
            }
            onChange();
        } finally {
            setClaiming(false);
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <div
                    className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tone.bg} ${tone.text} ${tone.border}`}>
                                    {tone.label}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                                    {status.label}
                                </span>
                                {task.taskToken && (
                                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                        #{task.taskToken}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 leading-snug">{task.title}</h2>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <SaveTaskButton taskId={task.id} />
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        {/* Metadata grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                            {task.requesterName && (
                                <div className="flex items-start gap-2">
                                    <UserIcon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Requester</div>
                                        <div className="font-semibold text-slate-800">{task.requesterName}</div>
                                        {task.requesterEmail && (
                                            <div className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5">
                                                <Mail className="w-3 h-3" /> {task.requesterEmail}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {task.requesterDivision && (
                                <div className="flex items-start gap-2">
                                    <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Division</div>
                                        <div className="font-semibold text-slate-800">{task.requesterDivision}</div>
                                    </div>
                                </div>
                            )}
                            {task.dueDate && (
                                <div className="flex items-start gap-2">
                                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Due Date</div>
                                        <div className="font-semibold text-slate-800">{formatDate(task.dueDate)}</div>
                                    </div>
                                </div>
                            )}
                            {task.targetChannel && (
                                <div className="flex items-start gap-2">
                                    <Hash className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Channel</div>
                                        <button
                                            type="button"
                                            onClick={() => router.push(`/channels?channel=${task.targetChannel?.id}`)}
                                            className="font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                                        >
                                            {task.targetChannel.name}
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            {task.assignee && (
                                <div className="flex items-start gap-2">
                                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[8px] font-bold overflow-hidden">
                                            {task.assignee.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={task.assignee.image} alt={task.assignee.name} className="w-4 h-4 rounded-full object-cover" />
                                            ) : (
                                                task.assignee.name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Assignee</div>
                                        <div className="font-semibold text-slate-800">{task.assignee.name}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div>
                            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">Description</div>
                            {sanitizedDescription ? (
                                <div
                                    className="prose prose-sm max-w-none text-sm text-slate-800 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:bg-slate-100 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline"
                                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                                />
                            ) : (
                                <p className="text-sm text-slate-400 italic">No description provided.</p>
                            )}
                        </div>

                        {/* Attachments — images and files combined into one ordered list */}
                        {attachments.length > 0 && (
                            <div>
                                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                                    Attachments ({attachments.length})
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {attachments.map((a, i) => a.isImage ? (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setLightboxUrl(a.url)}
                                            className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors group bg-slate-50"
                                            title={a.name}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={a.url} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                        </button>
                                    ) : (
                                        <a
                                            key={i}
                                            href={a.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="aspect-video flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors p-3 text-center"
                                            title={a.name}
                                        >
                                            <FileIcon className="w-6 h-6 text-slate-400" />
                                            <span className="text-[11px] font-medium text-slate-700 truncate w-full">{a.name}</span>
                                            <span className="text-[10px] text-slate-500">{formatBytes(a.size)}</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Comments thread — requester + claimer can chat with files/images/emoji/mentions */}
                        <div className="pt-2 border-t border-slate-100">
                            <TaskCommentsSection
                                taskId={task.id}
                                currentUserId={currentUserId}
                                size="compact"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-slate-500">
                            Posted {formatDate(task.createdAt)}
                            {task.assignedTeam && <> · Team: <span className="font-medium text-slate-700">{task.assignedTeam.name}</span></>}
                        </div>
                        <div className="flex items-center gap-2">
                            {error && <span className="text-xs text-rose-600">{error}</span>}
                            {!isClaimed && task.status === 'todo' ? (
                                <button
                                    type="button"
                                    onClick={handleClaim}
                                    disabled={claiming}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                                >
                                    {claiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {claiming ? 'Claiming…' : 'Claim task'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <ImageLightbox
                src={lightboxUrl}
                images={attachments.filter((a) => a.isImage).map((a) => a.url)}
                onClose={() => setLightboxUrl(null)}
            />
        </>
    );
}
