'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Download, Smile, Bookmark, BookmarkCheck, Pencil, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ReactionDisplay } from './ReactionDisplay';
import { ChannelMessageComposer } from './ChannelMessageComposer';

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
  sender: { id: string; name: string; image: string | null };
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
}

interface ParentMessage {
  id: string;
  content: string;
  attachments: any[];
  sender: { id: string; name: string; image: string | null };
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
  onReplyCountChange: (messageId: string, count: number) => void;
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
  onReplyCountChange,
}: ThreadPanelProps) {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchReplies = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/${message.id}/replies`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [channelId, message.id]);

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
      const res = await fetch(`/api/channels/${channelId}/${message.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments, mentions }),
      });
      if (res.ok) {
        const reply = await res.json();
        setReplies((prev) => [...prev, reply]);
        onReplyCountChange(message.id, replies.length + 1);
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {}
  };

  const handleReaction = async (replyId: string, emoji: string) => {
    try {
      await fetch(`/api/channels/${channelId}/${message.id}/reactions`, {
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
            {message.sender.image ? (
              <img src={message.sender.image} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              message.sender.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-bold text-sm text-slate-800">{message.sender.name}</span>
              <span className="text-[11px] text-slate-400">{formatTime(message.createdAt)}</span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
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
      />
    </div>
  );
}

function ThreadReplyItem({
  reply,
  channelId,
  messageId,
  currentUserId,
  onReaction,
  onReplyUpdated,
}: {
  reply: Reply;
  channelId: string;
  messageId: string;
  currentUserId: string;
  onReaction: (emoji: string) => void;
  onReplyUpdated: () => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);
  const [saving, setSaving] = useState(false);
  const isOwner = reply.senderId === currentUserId;
  const attachments = (Array.isArray(reply.attachments) ? reply.attachments : []) as Attachment[];
  const images = attachments.filter((a) => a.isImage);
  const docs = attachments.filter((a) => !a.isImage);

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/channels/${channelId}/${messageId}/save`, {
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
      const res = await fetch(`/api/channels/${channelId}/${messageId}/replies/${reply.id}`, {
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

  const handleDelete = async () => {
    if (!confirm('Delete this reply? This cannot be undone.')) return;
    try {
      await fetch(`/api/channels/${channelId}/${messageId}/replies/${reply.id}`, { method: 'DELETE' });
      onReplyUpdated();
    } catch {}
  };

  return (
    <div className="group relative px-4 py-2.5 hover:bg-slate-50 transition-colors">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
          {reply.sender.image ? (
            <img src={reply.sender.image} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            reply.sender.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-bold text-sm text-slate-800">{reply.sender.name}</span>
            <span className="text-[11px] text-slate-400">{formatTime(reply.createdAt)}</span>
          </div>
          {editing ? (
            <div className="mt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
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
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
              {reply.content}
              {reply.updatedAt && reply.createdAt !== reply.updatedAt &&
                new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() > 1000 && (
                <span className="text-[11px] text-slate-400 ml-1 italic">(edited)</span>
              )}
            </p>
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={img.url}
                  alt={img.name}
                  className="max-w-[200px] max-h-[150px] rounded-lg border border-slate-200 object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}

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
  );
}
