'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Bookmark, Hash, MessageSquare, Download, Trash2, ExternalLink } from 'lucide-react';

interface SavedItem {
  id: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
    attachments: any[];
    replyCount: number;
    createdAt: string;
    sender: { id: string; name: string; image: string | null };
    channel: { id: string; name: string };
  };
  reply: {
    id: string;
    content: string;
    attachments: any[];
    createdAt: string;
    sender: { id: string; name: string; image: string | null };
  } | null;
}

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function LaterPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    fetchSaved();
  }, [session]);

  const fetchSaved = async () => {
    try {
      const res = await fetch('/api/channels/saved');
      if (res.ok) {
        const data = await res.json();
        setSaved(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (item: SavedItem) => {
    const channelId = item.message.channel.id;
    const messageId = item.message.id;
    const replyId = item.reply?.id || null;
    await fetch(`/api/channels/${channelId}/${messageId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyId }),
    });
    setSaved((prev) => prev.filter((s) => s.id !== item.id));
  };

  const handleNavigate = (channelId: string, messageId?: string) => {
    const url = messageId
      ? `/channels?channel=${channelId}&highlight=${messageId}`
      : `/channels?channel=${channelId}`;
    router.push(url);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Bookmark className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Later</h1>
          <p className="text-sm text-slate-400">Messages you saved for later</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : saved.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Bookmark className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No saved messages</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Save messages for later by clicking the bookmark icon on any message in a channel.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {saved.map((item) => {
            // Use reply data if it's a saved reply, otherwise use message data
            const isReply = !!item.reply;
            const displayContent = isReply ? item.reply! : item.message;
            const attachments = Array.isArray(displayContent.attachments) ? displayContent.attachments : [];
            const images = attachments.filter((a: any) => a.isImage);
            const docs = attachments.filter((a: any) => !a.isImage);

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => handleNavigate(item.message.channel.id, item.message.id)}
              >
                {/* Channel badge */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleNavigate(item.message.channel.id, item.message.id); }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    <Hash className="w-3 h-3" />
                    {item.message.channel.name}
                  </button>
                  {isReply && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      <MessageSquare className="w-3 h-3" />
                      Thread reply
                    </span>
                  )}
                </div>

                {/* Show parent message context for replies */}
                {isReply && (
                  <div className="ml-3 pl-3 border-l-2 border-slate-200 mb-2">
                    <p className="text-xs text-slate-400">
                      <span className="font-medium text-slate-500">{item.message.sender.name}</span>: {item.message.content?.substring(0, 60) || '[Attachment]'}{item.message.content && item.message.content.length > 60 ? '...' : ''}
                    </p>
                  </div>
                )}

                {/* Content */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                    {displayContent.sender.image ? (
                      <img
                        src={displayContent.sender.image}
                        alt={displayContent.sender.name}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      displayContent.sender.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-bold text-sm text-slate-800">
                        {displayContent.sender.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(displayContent.createdAt)}
                      </span>
                    </div>
                    {displayContent.content && (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                        {displayContent.content}
                      </p>
                    )}

                    {/* Image attachments */}
                    {images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {images.map((img: any, idx: number) => (
                          <img
                            key={idx}
                            src={img.url}
                            alt={img.name}
                            className="max-w-[200px] max-h-[140px] rounded-lg border border-slate-200 object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}

                    {/* Doc attachments */}
                    {docs.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2">
                        {docs.map((doc: any, idx: number) => (
                          <a
                            key={idx}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors max-w-[260px]"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{doc.name}</span>
                            <span className="text-slate-400 flex-shrink-0">{formatFileSize(doc.size)}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Thread reply count (only for saved messages, not replies) */}
                    {!isReply && item.message.replyCount > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-indigo-600 font-medium">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {item.message.replyCount} {item.message.replyCount === 1 ? 'reply' : 'replies'}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnsave(item); }}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition-colors"
                      title="Remove from Later"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Footer: saved time + open in channel */}
                <div className="flex items-center justify-between mt-3 pl-12">
                  <span className="text-[11px] text-slate-300">
                    Saved {formatRelativeTime(item.createdAt)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleNavigate(item.message.channel.id, item.message.id); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in channel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
