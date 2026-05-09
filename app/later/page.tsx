'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Bookmark, Hash, MessageSquare, Download, Trash2, ExternalLink, ListTodo, Inbox, Send, Lock, CheckCircle2, Clock, PauseCircle } from 'lucide-react';
import { ImageLightbox } from '@/components/ImageLightbox';
import { linkifyHtml, linkifyText } from '@/lib/linkify';

interface SavedMessageItem {
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

interface SavedTaskItem {
  id: string;
  createdAt: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    urgency: string | null;
    priority: string | null;
    source: string;
    task_token: string | null;
    requester_name: string | null;
    requester_division: string | null;
    request_type: string | null;
    due_date: string | null;
    created_at: string;
    claimed_at: string | null;
    completed_at: string | null;
    assignee_name: string | null;
    direct_assignee_name: string | null;
    target_channel_id: string | null;
    channel_message_id: string | null;
  } | null;
}

interface PostedCardItem {
  id: string;
  title: string;
  status: string;
  urgency: string | null;
  task_token: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  due_date: string | null;
  claimer_name: string | null;
  claimer_image: string | null;
  target_channel_id: string | null;
  channel_message_id: string | null;
  channel_name: string | null;
  channel_is_private: boolean | null;
}

const statusColor: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600',
  'in-progress': 'bg-indigo-50 text-indigo-600',
  review: 'bg-purple-50 text-purple-600',
  done: 'bg-emerald-50 text-emerald-600',
  pending_completion_details: 'bg-amber-50 text-amber-600',
};

const urgencyColor: Record<string, string> = {
  P1: 'bg-rose-50 text-rose-600',
  P2: 'bg-orange-50 text-orange-600',
  P3: 'bg-amber-50 text-amber-600',
  P4: 'bg-emerald-50 text-emerald-600',
  '5-minute': 'bg-sky-50 text-sky-600',
};

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
  const [tab, setTab] = useState<'messages' | 'tasks' | 'posted-cards'>('messages');
  const [messages, setMessages] = useState<SavedMessageItem[]>([]);
  const [tasks, setTasks] = useState<SavedTaskItem[]>([]);
  const [postedCards, setPostedCards] = useState<PostedCardItem[]>([]);
  // Filter for the Posted Cards tab. 'all' is the default; the others map to
  // the Task.status values produced by the direct-assign flow.
  const [postedFilter, setPostedFilter] = useState<'all' | 'todo' | 'in-progress' | 'pending' | 'done'>('all');
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    fetchAll();
  }, [session]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [mRes, tRes, pcRes] = await Promise.all([
        fetch('/api/channels/saved'),
        fetch('/api/tasks/saved'),
        fetch('/api/tasks/posted-cards'),
      ]);
      if (mRes.ok) setMessages(await mRes.json());
      if (tRes.ok) setTasks(await tRes.json());
      if (pcRes.ok) setPostedCards(await pcRes.json());
    } catch {}
    setLoading(false);
  };

  const handleUnsaveMessage = async (item: SavedMessageItem) => {
    const channelId = item.message.channel.id;
    const messageId = item.message.id;
    const replyId = item.reply?.id || null;
    await fetch(`/api/channels/${channelId}/${messageId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyId }),
    });
    setMessages((prev) => prev.filter((s) => s.id !== item.id));
  };

  const handleUnsaveTask = async (item: SavedTaskItem) => {
    if (!item.task) return;
    await fetch(`/api/tasks/${item.task.id}/save`, { method: 'POST' });
    setTasks((prev) => prev.filter((s) => s.id !== item.id));
  };

  const handleNavigateMessage = (channelId: string, messageId?: string) => {
    const url = messageId
      ? `/messages?channel=${channelId}&highlight=${messageId}`
      : `/messages?channel=${channelId}`;
    router.push(url);
  };

  const handleNavigateTask = (item: SavedTaskItem) => {
    if (!item.task) return;
    const t = item.task;
    if (t.source === 'direct_request') {
      router.push(`/tasks?task=${t.id}`);
      return;
    }
    // direct_assign tasks aren't in /nexus's list (the queue excludes them),
    // so a plain /nexus highlight no-ops. Route to the source channel and
    // ask the channels page to auto-open the task detail modal.
    if (t.source === 'direct_assign') {
      const params = new URLSearchParams({ task: t.id, purpose: 'assign_task' });
      if (t.target_channel_id) params.set('channel', t.target_channel_id);
      if (t.channel_message_id) params.set('highlight', t.channel_message_id);
      router.push(`/messages?{params.toString()}`);
      return;
    }
    router.push(`/nexus?highlight=${t.id}&open=true`);
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Bookmark className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Later</h1>
          <p className="text-sm text-slate-400">Messages and tasks you saved for later</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-6">
        <button
          onClick={() => setTab('messages')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'messages'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Messages
          {messages.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[11px] bg-indigo-50 text-indigo-600 rounded-full">{messages.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('tasks')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'tasks'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          Tasks
          {tasks.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[11px] bg-indigo-50 text-indigo-600 rounded-full">{tasks.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('posted-cards')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'posted-cards'
              ? 'text-indigo-600 border-indigo-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <Send className="w-4 h-4" />
          Posted Cards
          {postedCards.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[11px] bg-indigo-50 text-indigo-600 rounded-full">{postedCards.length}</span>
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'messages' ? (
        messages.length === 0 ? (
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
            {messages.map((item) => {
              const isReply = !!item.reply;
              const displayContent = isReply ? item.reply! : item.message;
              const attachments = Array.isArray(displayContent.attachments) ? displayContent.attachments : [];
              const images = attachments.filter((a: any) => a.isImage);
              const docs = attachments.filter((a: any) => !a.isImage);

              return (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => handleNavigateMessage(item.message.channel.id, item.message.id)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNavigateMessage(item.message.channel.id, item.message.id); }}
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

                  {isReply && (
                    <div className="ml-3 pl-3 border-l-2 border-slate-200 mb-2">
                      <p className="text-xs text-slate-400">
                        <span className="font-medium text-slate-500">{item.message.sender.name}</span>: {item.message.content?.substring(0, 60) || '[Attachment]'}{item.message.content && item.message.content.length > 60 ? '...' : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                      {displayContent.sender.image ? (
                        <img src={displayContent.sender.image} alt={displayContent.sender.name} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        displayContent.sender.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="font-bold text-sm text-slate-800">{displayContent.sender.name}</span>
                        <span className="text-[11px] text-slate-400">{formatRelativeTime(displayContent.createdAt)}</span>
                      </div>
                      {displayContent.content && (() => {
                        const raw = displayContent.content as string;
                        // Saved messages may be HTML (from the rich composer) or plain text.
                        // Detect and render accordingly so chips/formatting/links display properly.
                        const isHtml = /<[a-z][\s\S]*?>/i.test(raw);
                        return (
                          <p
                            className="text-sm text-slate-700 whitespace-pre-wrap break-words [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                            dangerouslySetInnerHTML={{
                              __html: isHtml ? linkifyHtml(raw) : linkifyText(raw),
                            }}
                          />
                        );
                      })()}

                      {images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {images.map((img: any, idx: number) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setLightboxUrl(img.url); }}
                              className="rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors"
                              title="Click to preview"
                            >
                              <img src={img.url} alt={img.name} className="max-w-[200px] max-h-[140px] object-cover cursor-zoom-in" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      )}

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

                      {!isReply && item.message.replyCount > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-indigo-600 font-medium">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {item.message.replyCount} {item.message.replyCount === 1 ? 'reply' : 'replies'}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnsaveMessage(item); }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Remove from Later"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pl-12">
                    <span className="text-[11px] text-slate-300">Saved {formatRelativeTime(item.createdAt)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNavigateMessage(item.message.channel.id, item.message.id); }}
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
        )
      ) : tab === 'tasks' ? (
        tasks.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <ListTodo className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No saved tasks</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Save a task for later by clicking the bookmark icon in any task detail view.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((item) => {
            const t = item.task;
            if (!t) return null;
            const urgencyCls = (t.urgency && urgencyColor[t.urgency]) || 'bg-slate-100 text-slate-600';
            const statusCls = statusColor[t.status] || 'bg-slate-100 text-slate-600';
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => handleNavigateTask(item)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    {t.source === 'direct_request' ? (
                      <Inbox className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <ListTodo className="w-4 h-4 text-indigo-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {t.task_token && (
                        <span className="font-mono text-[11px] text-slate-400">{t.task_token}</span>
                      )}
                      {t.urgency && (
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${urgencyCls}`}>{t.urgency}</span>
                      )}
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${statusCls}`}>{t.status.replace('_', ' ')}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                        {t.source === 'direct_request' ? 'Direct Request' : 'Task Queue'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm text-slate-800 mb-1.5 break-words">{t.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      {t.requester_name && <span>Requester: <span className="text-slate-700 font-medium">{t.requester_name}</span></span>}
                      {t.assignee_name && <span>Assignee: <span className="text-slate-700 font-medium">{t.assignee_name}</span></span>}
                      {t.due_date && <span>Due: <span className="text-slate-700 font-medium">{new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUnsaveTask(item); }}
                      className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition-colors"
                      title="Remove from Later"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pl-12">
                  <span className="text-[11px] text-slate-300">Saved {formatRelativeTime(item.createdAt)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleNavigateTask(item); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* ─── Posted Cards tab ──────────────────────────────────────────── */
        postedCards.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-600 mb-1">No posted cards yet</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Cards you post into channels via Direct Assign show up here so you can track who claimed and completed each one.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status KPI strip — clicking a tile filters the list. */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { key: 'all',         label: 'Total',       count: postedCards.length,                                                       color: 'text-slate-700' },
                { key: 'todo',        label: 'Open',        count: postedCards.filter(c => c.status === 'todo').length,                      color: 'text-sky-500' },
                { key: 'in-progress', label: 'In Progress', count: postedCards.filter(c => c.status === 'in-progress').length,               color: 'text-indigo-500' },
                { key: 'pending',     label: 'Pending',     count: postedCards.filter(c => c.status === 'pending').length,                   color: 'text-amber-500' },
                { key: 'done',        label: 'Done',        count: postedCards.filter(c => c.status === 'done').length,                      color: 'text-emerald-500' },
              ].map(kpi => (
                <button
                  key={kpi.key}
                  type="button"
                  onClick={() => setPostedFilter(kpi.key as typeof postedFilter)}
                  className={`bg-white border rounded-xl p-3 text-left transition-colors ${
                    postedFilter === kpi.key ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className={`text-xl sm:text-2xl font-bold ${kpi.color}`}>{kpi.count}</p>
                  <p className="text-[11px] sm:text-xs text-slate-500 leading-tight">{kpi.label}</p>
                </button>
              ))}
            </div>

            {/* Card list — same data shape as direct-assign with claimer + channel. */}
            <ul className="space-y-2.5">
              {postedCards
                .filter(c => postedFilter === 'all' || c.status === postedFilter)
                .map(card => {
                  const urgencyCls = (card.urgency && urgencyColor[card.urgency]) || 'bg-slate-100 text-slate-600';
                  const StatusIcon = card.status === 'done' ? CheckCircle2
                    : card.status === 'pending' ? PauseCircle
                    : card.status === 'in-progress' ? Clock
                    : Inbox;
                  const statusLabel = card.status === 'done' ? 'Completed'
                    : card.status === 'in-progress' ? 'In Progress'
                    : card.status === 'pending' ? 'Pending'
                    : card.status === 'todo' ? 'Open'
                    : card.status;
                  const statusCls = statusColor[card.status] || 'bg-slate-100 text-slate-600';
                  const goToCard = () => {
                    if (!card.target_channel_id) return;
                    const params = new URLSearchParams({ task: card.id, purpose: 'assign_task', channel: card.target_channel_id });
                    if (card.channel_message_id) params.set('highlight', card.channel_message_id);
                    router.push(`/messages?{params.toString()}`);
                  };
                  return (
                    <li
                      key={card.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                      onClick={goToCard}
                    >
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {card.urgency && (
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${urgencyCls}`}>{card.urgency}</span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusCls}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusLabel}
                        </span>
                        {card.task_token && (
                          <span className="ml-auto font-mono text-[11px] text-indigo-500">{card.task_token}</span>
                        )}
                      </div>

                      <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words">{card.title}</h3>

                      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                        <div>
                          <dt className="text-slate-400">Channel</dt>
                          <dd className="text-slate-700 font-medium truncate flex items-center gap-1">
                            {card.channel_is_private ? <Lock className="w-3 h-3 text-indigo-400" /> : <Hash className="w-3 h-3 text-indigo-400" />}
                            {card.channel_name || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Claimed by</dt>
                          <dd className="text-slate-700 font-medium truncate">
                            {card.claimer_name || <span className="italic text-amber-600 font-normal">Unclaimed</span>}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Posted</dt>
                          <dd className="text-slate-700">{formatRelativeTime(card.created_at)}</dd>
                        </div>
                      </dl>

                      <div className="flex items-center justify-end mt-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); goToCard(); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open in channel
                        </button>
                      </div>
                    </li>
                  );
                })}
              {postedCards.filter(c => postedFilter === 'all' || c.status === postedFilter).length === 0 && (
                <li className="text-center py-8 text-sm text-slate-400">No cards match this filter.</li>
              )}
            </ul>
          </div>
        )
      )}

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
