'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Download, Smile, Bookmark, BookmarkCheck, Pencil, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ReactionDisplay } from './ReactionDisplay';
import { ChannelMessageComposer } from './ChannelMessageComposer';
import type { MentionTeam } from './MentionAutocomplete';
import { MentionTextarea } from './MentionTextarea';
import { ImageLightbox } from '@/components/ImageLightbox';
import { linkifyHtml, linkifyText } from '@/lib/linkify';
import { DeleteMessageModal } from './DeleteMessageModal';
import { DirectAssignCard } from './DirectAssignCard';
import { useCustomEmojiMap } from '@/lib/customEmojis';
import { renderShortcodes } from '@/lib/renderShortcodes';

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
}

interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string };
}

interface Reply {
  id: string;
  content: string;
  attachments: Attachment[];
  mentions: string[];
  senderId: string;
  // Nullable — see ChannelPane.tsx's Message interface for the reason.
  // Same API substrate (ChannelMessage rows), same orphan-sender shape.
  sender: { id: string; name: string; image: string | null } | null;
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
}

interface ParentMessage {
  id: string;
  content: string;
  attachments: any[];
  sender: { id: string; name: string; image: string | null } | null;
  replyCount: number;
  createdAt: string;
}

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface ThreadPanelProps {
  channelId: string;
  message: ParentMessage;
  currentUserId: string;
  onClose: () => void;
  users: MentionUser[];
  /** Same team-mention list the parent channel composer receives. Forwarded
   *  through to the reply composer so `@team-name` autocomplete works in
   *  threads, matching the primary chatbox behavior. */
  teams?: MentionTeam[];
  onReplyCountChange: (messageId: string, count: number) => void;
  /** Open the task detail modal — forwarded to DirectAssignCard in the parent. */
  onOpenTaskDetail?: (taskId: string) => void;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function ThreadPanel({
  channelId,
  message,
  currentUserId,
  onClose,
  users,
  teams = [],
  onReplyCountChange,
  onOpenTaskDetail,
}: ThreadPanelProps) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const customEmojiMap = useCustomEmojiMap();
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/${message.id}/replies`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data);
        // Sync the parent message's replyCount with whatever the API actually
        // returned so the channel card + thread header never lag behind the
        // rendered reply list. Without this the count drifts whenever a reply
        // arrives via the 3s poll (i.e. anything not sent by us).
        onReplyCountChange(message.id, Array.isArray(data) ? data.length : 0);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [channelId, message.id, onReplyCountChange]);

  useEffect(() => {
    fetchReplies();
    const interval = setInterval(fetchReplies, 3000);
    return () => clearInterval(interval);
  }, [fetchReplies]);

  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [replies.length, loading]);

  const handleSend = async (content: string, attachments: Attachment[], mentions: string[]) => {
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/${message.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments, mentions }),
      });
      if (res.ok) {
        const reply = await res.json();
        // Compute the new count from the freshly-set array, not the closure's
        // `replies` (which can be a tick stale if a poll just landed). The
        // setter callback hands us the authoritative previous value.
        setReplies((prev) => {
          const next = [...prev, reply];
          onReplyCountChange(message.id, next.length);
          return next;
        });
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {}
  };

  const handleReaction = async (replyId: string, emoji: string) => {
    try {
      await fetch(`/fast/api/channels/${channelId}/${message.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, replyId }),
      });
      fetchReplies();
    } catch {}
  };

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800">Thread</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
            {message.sender?.image ? (
              <img src={message.sender.image} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              (message.sender?.name ?? 'Deleted User').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-bold text-sm text-slate-800">{message.sender?.name ?? 'Deleted User'}</span>
              <span className="text-[11px] text-slate-400">{formatTime(message.createdAt)}</span>
            </div>
            {(() => {
              // Direct-assign card — same swap-in logic as the channel feed so
              // the thread parent renders the task card instead of the raw
              // marker + summary text.
              const directAssignMatch = message.content.match(/<!--direct_assign:([^\s>]+?)-->/);
              if (directAssignMatch) {
                const taskId = directAssignMatch[1].trim();
                const rest = message.content.replace(/<!--direct_assign:[^\s>]+?-->/, '').trim();
                const lines = rest.split('\n');
                const titleLine = (lines[0] || '').replace(/^📋\s*Task Request:\s*/, '').trim();
                const bodyLines = lines.slice(1).filter((l) => !/^Priority:/i.test(l.trim()));
                const bodyPreview = bodyLines.join('\n').trim();
                return (
                  <DirectAssignCard
                    taskId={taskId}
                    previewTitle={titleLine || '(no title)'}
                    previewBody={bodyPreview}
                    currentUserId={currentUserId}
                    onOpenDetail={onOpenTaskDetail}
                  />
                );
              }
              // Strip any other system-marker comments before rendering normal text.
              const cleaned = message.content.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s+|\s+$/g, '');
              if (/<[a-z][\s\S]*>/i.test(cleaned)) {
                return (
                  <div
                    className="text-sm text-slate-700 break-words [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                    dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyHtml(cleaned), customEmojiMap) }}
                  />
                );
              }
              return (
                <p
                  className="text-sm text-slate-700 whitespace-pre-wrap break-words [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                  dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyText(cleaned), customEmojiMap) }}
                />
              );
            })()}
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {/* Source of truth is the loaded replies array — `message.replyCount`
              is a snapshot from when the thread opened and goes stale as soon
              as a poll lands. While replies are still loading we fall back to
              the prop so the header doesn't flash "0 replies". */}
          {(() => {
            const count = !loading || replies.length > 0 ? replies.length : message.replyCount;
            return `${count} ${count === 1 ? 'reply' : 'replies'}`;
          })()}
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : replies.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            No replies yet. Start the thread!
          </div>
        ) : (
          replies.map((reply) => (
            <ThreadReplyItem
              key={reply.id}
              reply={reply}
              channelId={channelId}
              messageId={message.id}
              currentUserId={currentUserId}
              users={users}
              onReaction={(emoji) => handleReaction(reply.id, emoji)}
              onReplyUpdated={fetchReplies}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <ChannelMessageComposer
        channelName=""
        placeholder="Reply..."
        onSend={handleSend}
        users={users}
        teams={teams}
      />
    </div>
  );
}

function ThreadReplyItem({
  reply,
  channelId,
  messageId,
  currentUserId,
  users,
  onReaction,
  onReplyUpdated,
}: {
  reply: Reply;
  channelId: string;
  messageId: string;
  currentUserId: string;
  users: MentionUser[];
  onReaction: (emoji: string) => void;
  onReplyUpdated: () => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);
  const [saving, setSaving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isOwner = reply.senderId === currentUserId;
  const customEmojiMap = useCustomEmojiMap();
  const attachments = (Array.isArray(reply.attachments) ? reply.attachments : []) as Attachment[];
  const images = attachments.filter((a) => a.isImage);
  const docs = attachments.filter((a) => !a.isImage);

  const handleSave = async () => {
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/${messageId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsSaved(data.action === 'saved' || data.action === 'already_saved');
      }
    } catch {}
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/${messageId}/replies/${reply.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setEditing(false);
        onReplyUpdated();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = () => setDeleteOpen(true);
  const performDelete = async () => {
    try {
      await fetch(`/fast/api/channels/${channelId}/${messageId}/replies/${reply.id}`, { method: 'DELETE' });
      onReplyUpdated();
    } catch {}
  };

  return (
    <>
    <div className="group relative px-4 py-2.5 hover:bg-slate-50 transition-colors">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
          {reply.sender?.image ? (
            <img src={reply.sender.image} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            (reply.sender?.name ?? 'Deleted User').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-bold text-sm text-slate-800">{reply.sender?.name ?? 'Deleted User'}</span>
            <span className="text-[11px] text-slate-400">{formatTime(reply.createdAt)}</span>
          </div>
          {editing ? (
            <div className="mt-1">
              <MentionTextarea
                value={editContent}
                onChange={setEditContent}
                users={users}
                className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                  if (e.key === 'Escape') { setEditing(false); setEditContent(reply.content); }
                }}
              />
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleEdit}
                  disabled={saving || !editContent.trim()}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setEditContent(reply.content); }}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : /<[a-z][\s\S]*>/i.test(reply.content) ? (
              <div className="text-sm text-slate-700 break-words [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700">
                <span dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyHtml(reply.content), customEmojiMap) }} />
                {reply.updatedAt && reply.createdAt !== reply.updatedAt &&
                  new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() > 1000 && (
                  <span className="text-[11px] text-slate-400 ml-1 italic">(edited)</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700">
                <span dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyText(reply.content), customEmojiMap) }} />
                {reply.updatedAt && reply.createdAt !== reply.updatedAt &&
                  new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() > 1000 && (
                  <span className="text-[11px] text-slate-400 ml-1 italic">(edited)</span>
                )}
              </p>
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setLightboxUrl(img.url)}
                  className="relative rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors"
                >
                  <img
                    src={img.url}
                    alt={img.name}
                    className="max-w-[200px] max-h-[150px] rounded-lg object-cover cursor-zoom-in"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          <ImageLightbox src={lightboxUrl} images={images.map((i) => i.url)} onClose={() => setLightboxUrl(null)} />

          {docs.length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              {docs.map((doc, idx) => (
                <a
                  key={idx}
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[150px]">{doc.name}</span>
                  <span className="text-slate-400">{formatFileSize(doc.size)}</span>
                </a>
              ))}
            </div>
          )}

          <ReactionDisplay
            reactions={reply.reactions}
            currentUserId={currentUserId}
            onToggleReaction={onReaction}
            onOpenPicker={() => setShowEmojiPicker(true)}
          />
        </div>
      </div>

      {/* Hover action bar */}
      <div className="absolute top-1 right-2 hidden group-hover:flex bg-white border border-slate-200 rounded-lg shadow-md z-10">
        {/* Quick reaction emojis */}
        {['✅', '👀', '🙌'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => onReaction(emoji)}
            className="p-1 text-sm hover:bg-slate-50 transition-colors first:rounded-l-lg hover:scale-125"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
            title="Find another reaction"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              open={showEmojiPicker}
              onSelect={(emoji) => {
                onReaction(emoji);
                setShowEmojiPicker(false);
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}
        </div>
        <div className="w-px h-4 bg-slate-200 self-center" />
        <button
          onClick={handleSave}
          className={cn(
            'p-1.5 transition-colors hover:bg-slate-50 rounded-r-lg',
            isSaved
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-slate-400 hover:text-indigo-600'
          )}
          title={isSaved ? 'Unsave' : 'Save for later'}
        >
          {isSaved ? (
            <BookmarkCheck className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
        </button>
        {isOwner && (
          <>
            <div className="w-px h-4 bg-slate-200 self-center" />
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
              title="Edit reply"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-r-lg transition-colors"
              title="Delete reply"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
    <DeleteMessageModal
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      onConfirm={performDelete}
      kind="reply"
      preview={{
        senderName: reply.sender?.name ?? 'Deleted User',
        senderImage: reply.sender?.image ?? null,
        createdAt: reply.createdAt,
        content: reply.content,
        contextLabel: 'Thread reply',
      }}
    />
    </>
  );
}
