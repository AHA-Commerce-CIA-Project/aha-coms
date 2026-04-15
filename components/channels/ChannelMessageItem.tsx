'use client';

import { useState } from 'react';
import { MessageSquare, Smile, Bookmark, BookmarkCheck, Download, Pencil, Trash2, X, Check, Forward } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ReactionDisplay } from './ReactionDisplay';
import { cn } from '@/lib/utils';

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

interface Message {
  id: string;
  content: string;
  attachments: Attachment[];
  mentions: string[];
  replyCount: number;
  senderId: string;
  sender: { id: string; name: string; image: string | null };
  reactions: Reaction[];
  savedBy: { id: string }[];
  replies?: { id: string; createdAt: string; sender: { id: string; name: string; image: string | null } }[];
  createdAt: string;
  updatedAt: string;
}

interface ChannelMessageItemProps {
  message: Message;
  currentUserId: string;
  channelId: string;
  onOpenThread: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onSave: (messageId: string) => void;
  onMessageUpdated: () => void;
  onForward?: (message: Message) => void;
  allUsers?: { id: string; name: string }[];
  showAvatar?: boolean;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

function processHtmlContent(html: string): string {
  // Linkify URLs that aren't already inside <a> tags
  let result = html.replace(
    /(?<!href=["'])(?<!<a[^>]*>)(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-700 underline break-all">$1</a>'
  );
  // Style @mentions
  result = result.replace(
    /(@\w[\w.]*)/g,
    '<span class="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded">$1</span>'
  );
  return result;
}

function renderContent(
  content: string,
  allUsers?: { id: string; name: string }[],
  onMentionClick?: (userId: string) => void,
) {
  if (!content) return null;

  // If content contains HTML tags, render as rich text
  if (isHtmlContent(content)) {
    return (
      <span
        className="[&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
        dangerouslySetInnerHTML={{ __html: processHtmlContent(content) }}
      />
    );
  }

  // Plain text: split by @mentions and URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const mentionRegex = /(@\w[\w.]*)/g;
  const combinedRegex = /(https?:\/\/[^\s]+|@\w[\w.]*)/g;

  const parts = content.split(combinedRegex);
  return parts.map((part, i) => {
    // Check if it's a URL
    if (part && urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-700 underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    // Check if it's a @mention
    if (part && part.startsWith('@') && allUsers) {
      mentionRegex.lastIndex = 0;
      const name = part.slice(1);
      const user = allUsers.find(
        (u) => u.name.toLowerCase().replace(/\s+/g, '.') === name.toLowerCase() ||
               u.name.toLowerCase() === name.toLowerCase()
      );
      if (user) {
        return (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onMentionClick?.(user.id);
            }}
            className="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded hover:bg-indigo-100 transition-colors cursor-pointer inline"
          >
            {part}
          </button>
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

export function ChannelMessageItem({
  message,
  currentUserId,
  channelId,
  onOpenThread,
  onReaction,
  onSave,
  onMessageUpdated,
  onForward,
  allUsers,
  showAvatar = true,
}: ChannelMessageItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [profileUser, setProfileUser] = useState<{ id: string; name: string; email: string; image: string | null; role: string; status: string } | null>(null);
  const isOwner = message.senderId === currentUserId;

  const handleMentionClick = async (userId: string) => {
    try {
      const res = await fetch(`/api/chat/users`);
      if (res.ok) {
        const users = await res.json();
        const user = users.find((u: any) => u.id === userId);
        if (user) setProfileUser(user);
      }
    } catch {}
  };
  const isSaved = message.savedBy.length > 0;

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/messages/${message.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setEditing(false);
        onMessageUpdated();
      }
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    try {
      await fetch(`/api/channels/${channelId}/messages/${message.id}`, { method: 'DELETE' });
      onMessageUpdated();
    } catch {}
  };
  const attachments = (Array.isArray(message.attachments) ? message.attachments : []) as Attachment[];
  const images = attachments.filter((a) => a.isImage);
  const docs = attachments.filter((a) => !a.isImage);

  return (
    <>
      <div
        className="group relative px-6 py-2 hover:bg-slate-50 transition-colors"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => {
          setShowActions(false);
          setShowEmojiPicker(false);
        }}
      >
        {/* Saved for later indicator */}
        {isSaved && (
          <div className="flex items-center gap-1.5 mb-1 ml-12">
            <Bookmark className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-xs font-semibold text-amber-600">Saved for later</span>
          </div>
        )}
        <div className="flex gap-3">
          {/* Avatar */}
          {showAvatar ? (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
              {message.sender.image ? (
                <img
                  src={message.sender.image}
                  alt={message.sender.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                message.sender.name.charAt(0).toUpperCase()
              )}
            </div>
          ) : (
            <div className="w-9 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {/* Name + time */}
            {showAvatar && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-bold text-base text-slate-800">
                  {message.sender.name}
                </span>
                <span className="text-xs text-slate-400">
                  {formatTime(message.createdAt)}
                </span>
              </div>
            )}

            {/* Content */}
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
                    if (e.key === 'Escape') { setEditing(false); setEditContent(message.content); }
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
                    onClick={() => { setEditing(false); setEditContent(message.content); }}
                    className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-slate-400">esc to cancel, enter to save</span>
                </div>
              </div>
            ) : message.content ? (
              (() => {
                // Check for forwarded message
                const forwardMatch = message.content.match(/<!--forward:(.*?)-->/s);
                if (forwardMatch) {
                  try {
                    const fwd = JSON.parse(forwardMatch[1]);
                    const userMsg = message.content.replace(/<!--forward:.*?-->/s, '').trim();
                    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
                    return (
                      <div>
                        {userMsg && (
                          <p className="text-[15px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed mb-2">
                            {renderContent(userMsg, allUsers, handleMentionClick)}
                          </p>
                        )}
                        {/* Quoted forward card */}
                        <div className="border-l-4 border-indigo-400 bg-slate-50 rounded-r-xl p-3 mt-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                              {fwd.author?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-sm font-bold text-slate-900">{fwd.author}</span>
                          </div>
                          <p className="text-[14px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{fwd.content}</p>
                        </div>
                        {/* Source footer — outside the card, like Slack */}
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-2 text-xs">
                          {fwd.channelName && (
                            <>
                              <span className="text-slate-400">Posted in</span>
                              <a href={`/channels?channel=${fwd.channelId}`} className="font-semibold text-slate-600 hover:text-indigo-600 hover:underline">
                                # {fwd.channelName}
                              </a>
                            </>
                          )}
                          {fwd.isTask && fwd.taskToken && (
                            <>
                              <span className="text-slate-400">Forwarded from</span>
                              <span className="font-semibold text-slate-600">Task {fwd.taskToken}</span>
                            </>
                          )}
                          {fwd.date && (
                            <span className="text-slate-400">{new Date(fwd.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          )}
                          <span className="text-slate-300">|</span>
                          {fwd.channelId && fwd.messageId ? (
                            <a href={`/channels?channel=${fwd.channelId}&highlight=${fwd.messageId}`}
                              className="text-indigo-500 hover:text-indigo-700 font-semibold hover:underline">
                              View message
                            </a>
                          ) : fwd.isTask && fwd.taskToken ? (
                            <a href={`/nexus?highlight_token=${fwd.taskToken}&open=true`}
                              className="text-indigo-500 hover:text-indigo-700 font-semibold hover:underline">
                              View task
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  } catch {}
                }
                // Normal message
                return (
                  <p className="text-[15px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                    {renderContent(message.content, allUsers, handleMentionClick)}
                    {message.updatedAt && message.createdAt !== message.updatedAt &&
                      new Date(message.updatedAt).getTime() - new Date(message.createdAt).getTime() > 1000 && (
                      <span className="text-xs text-slate-400 ml-1 italic">(edited)</span>
                    )}
                  </p>
                );
              })()
            ) : null}

            {/* Image attachments */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxUrl(img.url)}
                    className="relative rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300 transition-colors"
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="max-w-[280px] max-h-[200px] object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Document attachments */}
            {docs.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {docs.map((doc, idx) => (
                  <a
                    key={idx}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-100 hover:border-indigo-300 transition-colors max-w-[300px]"
                  >
                    <Download className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {formatFileSize(doc.size)}
                    </span>
                  </a>
                ))}
              </div>
            )}

            {/* Reactions */}
            <ReactionDisplay
              reactions={message.reactions}
              currentUserId={currentUserId}
              onToggleReaction={(emoji) => onReaction(message.id, emoji)}
              onOpenPicker={() => setShowEmojiPicker(true)}
            />

            {/* Thread reply count with avatars */}
            {message.replyCount > 0 && (
              <button
                onClick={() => onOpenThread(message)}
                className="flex items-center gap-2 mt-2 group/thread hover:bg-slate-100 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
              >
                {/* Reply participant avatars */}
                {message.replies && message.replies.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {/* Deduplicate senders */}
                    {Array.from(new Map(message.replies.map((r) => [r.sender.id, r.sender])).values())
                      .slice(0, 3)
                      .map((sender) => (
                        <div
                          key={sender.id}
                          className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold border-2 border-white flex-shrink-0"
                        >
                          {sender.image ? (
                            <img src={sender.image} alt={sender.name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            sender.name.charAt(0).toUpperCase()
                          )}
                        </div>
                      ))}
                  </div>
                )}
                <span className="text-sm text-indigo-600 font-semibold group-hover/thread:underline">
                  {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                </span>
                {message.replies && message.replies[0] && (
                  <span className="text-xs text-slate-400">
                    Last reply {new Date(message.replies[0].createdAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {new Date(message.replies[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Hover action bar */}
        {showActions && (
          <div className="absolute top-0 right-4 -translate-y-1/2 flex items-center bg-white border border-slate-200 rounded-lg shadow-md">
            {/* Quick reaction emojis */}
            {['✅', '👀', '🙌'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => onReaction(message.id, emoji)}
                className="p-1 text-base hover:bg-slate-50 transition-colors first:rounded-l-lg hover:scale-125"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {/* Find another reaction */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                title="Find another reaction"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showEmojiPicker && (
                <EmojiPicker
                  open={showEmojiPicker}
                  onSelect={(emoji) => {
                    onReaction(message.id, emoji);
                    setShowEmojiPicker(false);
                  }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
            </div>
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={() => onOpenThread(message)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
              title="Reply in thread"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => onSave(message.id)}
              className={cn(
                'p-1.5 transition-colors hover:bg-slate-50 rounded-r-lg',
                isSaved
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-slate-400 hover:text-indigo-600'
              )}
              title={isSaved ? 'Unsave' : 'Save for later'}
            >
              {isSaved ? (
                <BookmarkCheck className="w-4 h-4" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>
            {onForward && (
              <button
                onClick={() => onForward(message)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                title="Forward to channel"
              >
                <Forward className="w-4 h-4" />
              </button>
            )}
            {isOwner && (
              <>
                <div className="w-px h-5 bg-slate-200" />
                <button
                  onClick={() => { setEditing(true); setShowActions(false); }}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                  title="Edit message"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-r-lg transition-colors"
                  title="Delete message"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* User Profile Popup */}
      {profileUser && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center" onClick={() => setProfileUser(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center mx-auto mb-3 text-white text-xl font-bold overflow-hidden">
              {profileUser.image ? (
                <img src={profileUser.image} alt={profileUser.name} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                profileUser.name.charAt(0).toUpperCase()
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-800">{profileUser.name}</h3>
            <p className="text-sm text-slate-400 mb-2">{profileUser.email}</p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium capitalize">
                {profileUser.role}
              </span>
              {profileUser.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  profileUser.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                  profileUser.status === 'away' ? 'bg-amber-100 text-amber-700' :
                  profileUser.status === 'busy' ? 'bg-rose-100 text-rose-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {profileUser.status}
                </span>
              )}
            </div>
            <button
              onClick={() => setProfileUser(null)}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
