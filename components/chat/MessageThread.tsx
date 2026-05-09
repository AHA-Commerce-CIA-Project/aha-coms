'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { FileText, Download, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/sanitize';
import { ImageLightbox as SharedImageLightbox } from '@/components/ImageLightbox';
import { DirectAssignCard } from '@/components/channels/DirectAssignCard';

interface Attachment {
    url: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
}

interface Message {
    id: string;
    content: string;
    attachments?: Attachment[];
    senderId: string;
    senderName: string;
    senderImage: string | null;
    createdAt: string;
}

interface MessageThreadProps {
    messages: Message[];
    currentUserId: string;
    otherUserName: string;
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
}

function formatMessageTime(d: string) {
    return new Date(d).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function formatDateDivider(d: string) {
    const date = new Date(d);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
}

function shouldShowDateDivider(current: string, previous: string | null) {
    if (!previous) return true;
    const currentDate = new Date(current).toDateString();
    const previousDate = new Date(previous).toDateString();
    return currentDate !== previousDate;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(type: string): string {
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet') || type.includes('csv')) return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
    if (type.includes('text')) return '📃';
    return '📎';
}

// Attachment renderer — uses the shared ImageLightbox so multi-image messages
// get prev/next nav. The full sibling-image gallery is threaded down so the
// lightbox knows what to paginate through.
function AttachmentRenderer({
    attachment,
    isOwn,
    siblingImageUrls,
}: {
    attachment: Attachment;
    isOwn: boolean;
    siblingImageUrls: string[];
}) {
    const [lightboxOpen, setLightboxOpen] = useState(false);

    if (attachment.isImage) {
        return (
            <>
                <button
                    onClick={() => setLightboxOpen(true)}
                    className="block mt-1.5 rounded-xl overflow-hidden max-w-[280px] border border-slate-200/50 hover:opacity-90 transition-opacity cursor-zoom-in"
                >
                    <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="max-w-full max-h-[300px] object-contain bg-slate-50"
                        loading="lazy"
                    />
                </button>
                {lightboxOpen && (
                    <SharedImageLightbox
                        src={attachment.url}
                        alt={attachment.name}
                        images={siblingImageUrls}
                        onClose={() => setLightboxOpen(false)}
                    />
                )}
            </>
        );
    }

    // Document attachment
    return (
        <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'flex items-center gap-3 mt-1.5 px-3 py-2.5 rounded-xl transition-colors max-w-[280px]',
                isOwn
                    ? 'bg-indigo-500/30 hover:bg-indigo-500/40'
                    : 'bg-white border border-slate-200 hover:bg-slate-50'
            )}
        >
            <span className="text-xl flex-shrink-0">{getFileIcon(attachment.type)}</span>
            <div className="min-w-0 flex-1">
                <p className={cn(
                    'text-xs font-semibold truncate',
                    isOwn ? 'text-white' : 'text-slate-700'
                )}>
                    {attachment.name}
                </p>
                <p className={cn(
                    'text-[10px]',
                    isOwn ? 'text-indigo-200' : 'text-slate-400'
                )}>
                    {formatFileSize(attachment.size)}
                </p>
            </div>
            <Download className={cn(
                'w-4 h-4 flex-shrink-0',
                isOwn ? 'text-indigo-200' : 'text-slate-400'
            )} />
        </a>
    );
}

export function MessageThread({
    messages,
    currentUserId,
    otherUserName,
    loading,
    hasMore,
    onLoadMore,
}: MessageThreadProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevMessageCountRef = useRef(0);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messages.length > prevMessageCountRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        prevMessageCountRef.current = messages.length;
    }, [messages.length]);

    // Scroll to bottom on initial load
    useEffect(() => {
        if (!loading && messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }, [loading]);

    const handleScroll = useCallback(() => {
        const container = containerRef.current;
        if (!container || !hasMore || loading) return;

        if (container.scrollTop < 100) {
            onLoadMore();
        }
    }, [hasMore, loading, onLoadMore]);

    // Messages are returned newest-first from API, reverse them for display
    const sortedMessages = [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    if (loading && messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading messages...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-6 py-4"
        >
            {/* Load more indicator */}
            {hasMore && (
                <div className="flex justify-center py-3">
                    <button
                        onClick={onLoadMore}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                    >
                        Load older messages
                    </button>
                </div>
            )}

            {sortedMessages.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                        <span className="text-2xl font-bold text-indigo-600">
                            {otherUserName.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    <p className="text-base font-semibold text-slate-700">{otherUserName}</p>
                    <p className="text-sm text-slate-400 mt-1">
                        This is the beginning of your conversation.
                    </p>
                    <p className="text-sm text-slate-400">
                        Say hi! 👋
                    </p>
                </div>
            ) : (
                sortedMessages.map((msg, idx) => {
                    const isOwn = msg.senderId === currentUserId;
                    const prevMsg = idx > 0 ? sortedMessages[idx - 1] : null;
                    const showDate = shouldShowDateDivider(
                        msg.createdAt,
                        prevMsg?.createdAt || null
                    );
                    // Group consecutive messages from same sender
                    const isConsecutive = prevMsg?.senderId === msg.senderId && !showDate;
                    const msgAttachments: Attachment[] = Array.isArray(msg.attachments) ? msg.attachments : [];
                    const hasText = !!msg.content;
                    const hasAttachments = msgAttachments.length > 0;

                    return (
                        <div key={msg.id}>
                            {/* Date Divider */}
                            {showDate && (
                                <div className="flex items-center gap-3 my-5">
                                    <div className="flex-1 h-px bg-slate-200" />
                                    <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                                        {formatDateDivider(msg.createdAt)}
                                    </span>
                                    <div className="flex-1 h-px bg-slate-200" />
                                </div>
                            )}

                            {/* Message */}
                            <div
                                className={cn(
                                    'flex gap-2.5',
                                    isOwn ? 'justify-end' : 'justify-start',
                                    isConsecutive ? 'mt-0.5' : 'mt-4'
                                )}
                            >
                                {/* Avatar (other user only, only on first message in group) */}
                                {!isOwn && !isConsecutive && (
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1">
                                        {msg.senderImage ? (
                                            <img src={msg.senderImage} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            <span className="text-xs font-bold text-indigo-700">
                                                {msg.senderName.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {!isOwn && isConsecutive && <div className="w-8 flex-shrink-0" />}

                                <div className={cn('max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
                                    {/* Sender name + time (first message in group) */}
                                    {!isConsecutive && (
                                        <div className={cn(
                                            'flex items-baseline gap-2 mb-1',
                                            isOwn ? 'justify-end' : 'justify-start'
                                        )}>
                                            <span className="text-xs font-bold text-slate-700">
                                                {isOwn ? 'You' : msg.senderName}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                                {formatMessageTime(msg.createdAt)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Text bubble — with forward-card unfurl */}
                                    {hasText && (() => {
                                        const fwdMatch = msg.content.match(/<!--forward:(.*?)-->/s);
                                        if (fwdMatch) {
                                            try {
                                                const fwd = JSON.parse(fwdMatch[1]);
                                                const userMsg = msg.content.replace(/<!--forward:.*?-->/s, '').trim();
                                                const fwdDate = fwd.date
                                                    ? new Date(fwd.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                    : null;
                                                return (
                                                    <div className={cn(
                                                        'rounded-2xl px-3 py-2.5 max-w-full',
                                                        isOwn
                                                            ? 'bg-indigo-50 border border-indigo-100'
                                                            : 'bg-slate-50 border border-slate-200',
                                                    )}>
                                                        {userMsg && (
                                                            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words mb-2">
                                                                {userMsg}
                                                            </p>
                                                        )}
                                                        {/* Forwarded tasks render as a live DirectAssignCard. The
                                                            receiver gets the same orange "TASK REQUEST" card with
                                                            claim/complete/status — not a static text quote. */}
                                                        {fwd.isTask && fwd.taskId ? (
                                                            <DirectAssignCard
                                                                taskId={fwd.taskId}
                                                                previewTitle={fwd.taskToken ? `Task ${fwd.taskToken}` : 'Task'}
                                                                previewBody={htmlToPlainText(fwd.content || '')}
                                                                currentUserId={currentUserId}
                                                            />
                                                        ) : (
                                                        <div className="border-l-4 border-indigo-400 bg-white rounded-r-xl p-3 shadow-sm">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                                                    {fwd.author?.charAt(0)?.toUpperCase() || '?'}
                                                                </div>
                                                                <span className="text-sm font-bold text-slate-900 truncate">{fwd.author}</span>
                                                            </div>
                                                            <p className="text-[14px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed line-clamp-6">
                                                                {htmlToPlainText(fwd.content)}
                                                            </p>
                                                        </div>
                                                        )}
                                                        {/* Source footer — Slack-style */}
                                                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-2 text-xs">
                                                            <span className="text-slate-400">Forwarded from</span>
                                                            {fwd.channelName ? (
                                                                <a href={`/messages?channel=${fwd.channelId || ''}`} className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline">
                                                                    #{fwd.channelName}
                                                                </a>
                                                            ) : fwd.isTask ? (
                                                                <span className="font-semibold text-slate-700">
                                                                    {fwd.taskToken ? `Task ${fwd.taskToken}` : 'a task'}
                                                                </span>
                                                            ) : (
                                                                <span className="font-semibold text-slate-700">{fwd.author}</span>
                                                            )}
                                                            {fwdDate && (
                                                                <>
                                                                    <span className="text-slate-300">·</span>
                                                                    <span className="text-slate-400">{fwdDate}</span>
                                                                </>
                                                            )}
                                                            {(fwd.channelId && fwd.messageId) || (fwd.isTask && (fwd.taskToken || fwd.taskId)) ? (
                                                                <>
                                                                    <span className="text-slate-300">·</span>
                                                                    {fwd.channelId && fwd.messageId ? (
                                                                        <a
                                                                            href={`/messages?channel=${fwd.channelId}&highlight=${fwd.messageId}`}
                                                                            className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline"
                                                                        >
                                                                            View message
                                                                        </a>
                                                                    ) : (
                                                                        <a
                                                                            href={fwd.taskToken
                                                                                ? `/nexus?highlight_token=${fwd.taskToken}&open=true`
                                                                                : `/messages?task=${fwd.taskId}`}
                                                                            className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline"
                                                                        >
                                                                            View task
                                                                        </a>
                                                                    )}
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            } catch {}
                                        }
                                        return (
                                            <div
                                                className={cn(
                                                    'px-4 py-2.5 text-sm leading-relaxed break-words',
                                                    isOwn
                                                        ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-md shadow-sm'
                                                        : 'bg-slate-100 text-slate-800 rounded-2xl rounded-tl-md'
                                                )}
                                            >
                                                {msg.content.split('\n').map((line, i) => (
                                                    <span key={i}>
                                                        {line}
                                                        {i < msg.content.split('\n').length - 1 && <br />}
                                                    </span>
                                                ))}
                                            </div>
                                        );
                                    })()}

                                    {/* Attachments */}
                                    {hasAttachments && (
                                        <div className={cn(
                                            'flex flex-col gap-1',
                                            isOwn ? 'items-end' : 'items-start'
                                        )}>
                                            {(() => {
                                                const siblingImageUrls = msgAttachments
                                                    .filter((a) => a.isImage)
                                                    .map((a) => a.url);
                                                return msgAttachments.map((att, attIdx) => (
                                                    <AttachmentRenderer
                                                        key={attIdx}
                                                        attachment={att}
                                                        isOwn={isOwn}
                                                        siblingImageUrls={siblingImageUrls}
                                                    />
                                                ));
                                            })()}
                                        </div>
                                    )}

                                    {/* Time for consecutive messages */}
                                    {isConsecutive && (
                                        <div className={cn(
                                            'mt-0.5',
                                            isOwn ? 'text-right' : 'text-left'
                                        )}>
                                            <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {formatMessageTime(msg.createdAt)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            <div ref={messagesEndRef} />
        </div>
    );
}
