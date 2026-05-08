'use client';

import { useState } from 'react';
import { MessageSquare, Smile, Bookmark, BookmarkCheck, Download, Pencil, Trash2, Check, Forward, UserPlus, UserMinus, Hash } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ReactionDisplay } from './ReactionDisplay';
import { MentionTextarea } from './MentionTextarea';
import { ImageLightbox } from '@/components/ImageLightbox';
import { DirectAssignCard } from './DirectAssignCard';
import { TeamMembersPopover } from './TeamMembersPopover';
import { DeleteMessageModal } from './DeleteMessageModal';
import { useAppStore } from '@/lib/store';
import { htmlToPlainText, isHtml } from '@/lib/sanitize';

// Editing happens in a plaintext MentionTextarea, but the channel composer
// now stores rich HTML (lists, bold, etc.) — show the user readable text
// instead of raw markup like "<div>...</div><br>...". Plain-text messages
// pass through unchanged.
const editableText = (raw: string) => (isHtml(raw) ? htmlToPlainText(raw) : raw);
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
  channelName?: string;
  onOpenThread: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onSave: (messageId: string) => void;
  onMessageUpdated: () => void;
  onForward?: (message: Message) => void;
  /** Convert this message into a Direct Assign task. Visible only on the
      author's own non-card messages. */
  onDirectAssign?: (message: Message) => void;
  allUsers?: { id: string; name: string; email?: string; image?: string | null }[];
  allTeams?: { id: string; name: string; mentionHandle: string }[];
  showAvatar?: boolean;
  /** Open the task detail modal — forwarded to DirectAssignCard. */
  onOpenTaskDetail?: (taskId: string) => void;
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

function processHtmlContent(
  html: string,
  allUsers?: { id: string; name: string }[],
  allTeams?: { id: string; mentionHandle: string }[],
): string {
  // Linkify URLs that aren't already inside <a> tags
  let result = html.replace(
    /(?<!href=["'])(?<!<a[^>]*>)(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-700 underline break-all">$1</a>'
  );

  // Extract pre-styled mention chips so the @-regex below doesn't double-wrap them.
  // While extracting, rewrite the chip's inner text from the LIVE user name if
  // `data-user-id` is present — keeps mentions in-sync with display-name changes.
  // Also add cursor-pointer hover styling so chips look clickable (event delegation
  // attached on the wrapper handles the actual click).
  const chips: string[] = [];
  result = result.replace(
    /<span\b([^>]*class="[^"]*mention-chip[^"]*"[^>]*)>([\s\S]*?)<\/span>/g,
    (match, attrs: string, innerText) => {
      const userIdMatch = attrs.match(/data-user-id="([^"]+)"/);
      const teamIdMatch = attrs.match(/data-team-id="([^"]+)"/);
      let finalText = innerText;
      if (userIdMatch && allUsers) {
        const user = allUsers.find((u) => u.id === userIdMatch[1]);
        if (user) finalText = '@' + user.name.replace(/\s+/g, '.');
      }
      // Inject hover/cursor classes once.
      const enhancedAttrs = attrs.includes('cursor-pointer')
        ? attrs
        : attrs.replace(
            /class="([^"]*)"/,
            (_, c) => `class="${c} cursor-pointer hover:brightness-95 transition-colors"`,
          );
      const rebuilt = `<span${enhancedAttrs}>${finalText}</span>`;
      chips.push(rebuilt);
      return `\u0000CHIP_${chips.length - 1}\u0000`;
    }
  );

  // Style remaining plain @mentions — but check whether each handle matches a known team
  // so team mentions get emerald styling + a clickable data attribute.
  result = result.replace(
    /(@\w[\w.]*)/g,
    (match) => {
      const handle = match.slice(1).toLowerCase();
      const team = allTeams?.find((t) => t.mentionHandle.toLowerCase() === handle);
      if (team) {
        return `<span class="mention-chip text-emerald-700 font-semibold bg-emerald-50 px-1 rounded cursor-pointer hover:brightness-95 transition-colors" data-team-id="${team.id}" data-team-handle="${team.mentionHandle}">${match}</span>`;
      }
      return `<span class="text-indigo-600 font-semibold bg-indigo-50 px-1 rounded">${match}</span>`;
    },
  );

  // Restore chips
  result = result.replace(/\u0000CHIP_(\d+)\u0000/g, (_, i) => chips[parseInt(i, 10)]);

  return result;
}

function renderContent(
  content: string,
  allUsers?: { id: string; name: string }[],
  onMentionClick?: (userId: string) => void,
  allTeams?: { id: string; mentionHandle: string }[],
  onTeamClick?: (teamId: string) => void,
) {
  if (!content) return null;

  // If content contains HTML tags, render as rich text. Click delegation lives on
  // the wrapper in the parent component, so chips inside dangerouslySetInnerHTML
  // become clickable without rebuilding the tree as React nodes.
  if (isHtmlContent(content)) {
    return (
      <span
        className="text-[15px] leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
        dangerouslySetInnerHTML={{ __html: processHtmlContent(content, allUsers, allTeams) }}
      />
    );
  }

  // Plain text: split by @mentions and URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
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
    // Check if it's a @mention — try team handles first, then user names.
    if (part && part.startsWith('@')) {
      const handle = part.slice(1).toLowerCase();
      const team = allTeams?.find((t) => t.mentionHandle.toLowerCase() === handle);
      if (team) {
        return (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              onTeamClick?.(team.id);
            }}
            className="text-emerald-700 font-semibold bg-emerald-50 px-1 rounded hover:bg-emerald-100 transition-colors cursor-pointer inline"
          >
            {part}
          </button>
        );
      }
      if (allUsers) {
        const user = allUsers.find(
          (u) => u.name.toLowerCase().replace(/\s+/g, '.') === handle ||
                 u.name.toLowerCase() === handle
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
    }
    return <span key={i}>{part}</span>;
  });
}

export function ChannelMessageItem({
  message,
  currentUserId,
  channelId,
  channelName,
  onOpenThread,
  onReaction,
  onSave,
  onMessageUpdated,
  onForward,
  onDirectAssign,
  allUsers,
  allTeams,
  showAvatar = true,
  onOpenTaskDetail,
}: ChannelMessageItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // All images on this message — fed to the lightbox so users can paginate
  // between siblings without closing/reopening for each.
  const lightboxGallery = (Array.isArray(message.attachments) ? message.attachments : [])
    .filter((a: any) => a?.isImage)
    .map((a: any) => a.url as string);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(editableText(message.content));
  const [saving, setSaving] = useState(false);
  const [teamPopoverId, setTeamPopoverId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setProfileUser = useAppStore((s) => s.setProfileUser);
  const isOwner = message.senderId === currentUserId;

  const handleMentionClick = async (userId: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const user = await res.json();
        // Single source of truth in the store — overwrites any previously-open
        // profile so clicking a different person always shows the right panel.
        setProfileUser(user);
      }
    } catch {} finally {
      setProfileLoading(false);
    }
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

  const handleDelete = () => setDeleteOpen(true);
  const performDelete = async () => {
    try {
      await fetch(`/api/channels/${channelId}/messages/${message.id}`, { method: 'DELETE' });
      onMessageUpdated();
    } catch {}
  };
  const attachments = (Array.isArray(message.attachments) ? message.attachments : []) as Attachment[];
  const images = attachments.filter((a) => a.isImage);
  const docs = attachments.filter((a) => !a.isImage);
  // For direct-assign messages, the same attachments are surfaced inside the
  // task detail modal — don't render them again next to the card.
  const isDirectAssignCard = !!message.content?.match(/<!--direct_assign:[^\s>]+?-->/);

  // Slack-style system messages (channel created, member added, member removed).
  // These bypass the normal avatar/name layout and render as a centered, italic
  // notice. The marker prefix is stripped before display.
  const sysMatch = message.content?.match(
    /^<!--system:(channel_created|member_added|member_removed)-->([\s\S]*)$/,
  );
  if (sysMatch) {
    const kind = sysMatch[1] as 'channel_created' | 'member_added' | 'member_removed';
    const baked = sysMatch[2].trim();
    let text = baked;
    let Icon = Hash;
    let iconClass = 'text-indigo-500';
    if (kind === 'channel_created') {
      const date = new Date(message.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });
      text = `${message.sender.name} created this channel on ${date}. This is the very beginning of the #${channelName || 'channel'} channel.`;
      Icon = Hash;
      iconClass = 'text-indigo-500';
    } else if (kind === 'member_added') {
      Icon = UserPlus;
      iconClass = 'text-emerald-500';
    } else if (kind === 'member_removed') {
      Icon = UserMinus;
      iconClass = 'text-rose-500';
    }
    return (
      <div className="px-6 py-2 flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
        <p className="text-[13px] text-slate-500 leading-relaxed">
          {text}
          <span className="text-slate-300 ml-2 text-[11px]">
            {formatTime(message.createdAt)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        // Wider mobile padding (px-3) but keep desktop's px-6. The tap handler
        // here toggles the action toolbar on touch devices — onMouseEnter alone
        // is unreliable on iOS and useless on Android Chrome, so a deliberate
        // tap is the only way to surface the toolbar without a hover signal.
        className="group relative px-3 sm:px-6 py-2 hover:bg-slate-50 transition-colors"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => {
          setShowActions(false);
          setShowEmojiPicker(false);
        }}
        onClick={(e) => {
          // Don't hijack clicks on real interactive elements (buttons, links,
          // textareas inside the message). Only toggle when the user taps the
          // bare message background.
          const t = e.target as HTMLElement;
          if (t.closest('button, a, input, textarea, [role="button"]')) return;
          setShowActions((v) => !v);
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
            <button
              type="button"
              onClick={() => handleMentionClick(message.senderId)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden hover:ring-2 hover:ring-indigo-300 transition-all cursor-pointer"
              title="View profile"
            >
              {message.sender.image ? (
                <img
                  src={message.sender.image}
                  alt={message.sender.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                message.sender.name.charAt(0).toUpperCase()
              )}
            </button>
          ) : (
            <div className="w-9 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {/* Name + time */}
            {showAvatar && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <button
                  type="button"
                  onClick={() => handleMentionClick(message.senderId)}
                  className="font-bold text-base text-slate-800 hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                  title="View profile"
                >
                  {message.sender.name}
                </button>
                <span className="text-xs text-slate-400">
                  {formatTime(message.createdAt)}
                </span>
              </div>
            )}

            {/* Content */}
            {editing ? (
              <div className="mt-1">
                <MentionTextarea
                  value={editContent}
                  onChange={setEditContent}
                  users={(allUsers || []).map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email || '',
                    image: u.image ?? null,
                  }))}
                  className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                    if (e.key === 'Escape') { setEditing(false); setEditContent(editableText(message.content)); }
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
                    onClick={() => { setEditing(false); setEditContent(editableText(message.content)); }}
                    className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-slate-400">esc to cancel, enter to save</span>
                </div>
              </div>
            ) : message.content ? (
              (() => {
                // Direct Assign card — message carries a <!--direct_assign:TASK_ID--> marker.
                // Task IDs are UUIDs and contain hyphens, so match any non-whitespace chars up to -->.
                const directAssignMatch = message.content.match(/<!--direct_assign:([^\s>]+?)-->/);
                if (directAssignMatch) {
                  const taskId = directAssignMatch[1].trim();
                  const rest = message.content.replace(/<!--direct_assign:[^\s>]+?-->/, '').trim();
                  // First line is the title ("📋 Task Request: ...") — strip the emoji prefix for the card preview.
                  const lines = rest.split('\n');
                  const titleLine = (lines[0] || '').replace(/^📋\s*Task Request:\s*/, '').trim();
                  // Remaining lines (skip "Priority: X" line) form the body preview.
                  const bodyLines = lines.slice(1).filter(l => !/^Priority:/i.test(l.trim()));
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
                            {renderContent(userMsg, allUsers, handleMentionClick, allTeams, (teamId) => setTeamPopoverId(teamId))}
                          </p>
                        )}
                        {/* Task forwards render as a live DirectAssignCard so the
                            receiver gets the same orange "TASK REQUEST" card
                            they'd see in a normal direct-assign channel — with
                            claim/complete/status, not a static text quote. */}
                        {fwd.isTask && fwd.taskId ? (
                          <DirectAssignCard
                            taskId={fwd.taskId}
                            previewTitle={fwd.taskToken ? `Task ${fwd.taskToken}` : 'Task'}
                            previewBody={htmlToPlainText(fwd.content || '')}
                            currentUserId={currentUserId}
                            onOpenDetail={onOpenTaskDetail}
                          />
                        ) : (
                        <div className="border-l-4 border-indigo-400 bg-slate-50 rounded-r-xl p-3 mt-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                              {fwd.author?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-sm font-bold text-slate-900">{fwd.author}</span>
                          </div>
                          <p className="text-[14px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed">{htmlToPlainText(fwd.content)}</p>
                        </div>
                        )}
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
                          {fwd.isTask && (
                            <>
                              <span className="text-slate-400">Forwarded from</span>
                              <span className="font-semibold text-slate-600">
                                {fwd.taskToken ? `Task ${fwd.taskToken}` : 'a task'}
                              </span>
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
                          ) : fwd.isTask && (fwd.taskToken || fwd.taskId) ? (
                            <a
                              href={fwd.taskToken
                                ? `/nexus?highlight_token=${fwd.taskToken}&open=true`
                                : `/channels?task=${fwd.taskId}`}
                              className="text-indigo-500 hover:text-indigo-700 font-semibold hover:underline">
                              View task
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  } catch {}
                }
                // Normal message — wrap in a delegating click handler so HTML chips
                // (rendered via dangerouslySetInnerHTML) become clickable.
                const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
                  const target = (e.target as HTMLElement).closest('[data-user-id], [data-team-id]') as HTMLElement | null;
                  if (!target) return;
                  e.stopPropagation();
                  const userId = target.getAttribute('data-user-id');
                  const teamId = target.getAttribute('data-team-id');
                  if (userId) handleMentionClick(userId);
                  else if (teamId) setTeamPopoverId(teamId);
                };
                return (
                  <p
                    onClick={handleContentClick}
                    className="text-[15px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed"
                  >
                    {renderContent(message.content, allUsers, handleMentionClick, allTeams, (teamId) => setTeamPopoverId(teamId))}
                    {message.updatedAt && message.createdAt !== message.updatedAt &&
                      new Date(message.updatedAt).getTime() - new Date(message.createdAt).getTime() > 1000 && (
                      <span className="text-xs text-slate-400 ml-1 italic">(edited)</span>
                    )}
                  </p>
                );
              })()
            ) : null}

            {/* Image attachments */}
            {!isDirectAssignCard && images.length > 0 && (
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
            {!isDirectAssignCard && docs.length > 0 && (
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

        {/* Hover/tap action bar — shifts left on mobile so it doesn't get
            clipped by the viewport edge and bumps padding so each icon target
            clears the 44pt touch minimum. */}
        {showActions && (
          <div className="absolute top-0 right-1 sm:right-4 -translate-y-1/2 flex items-center bg-white border border-slate-200 rounded-lg shadow-md max-w-[calc(100vw-1rem)] overflow-x-auto">
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
                className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                title="Find another reaction"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showEmojiPicker && (
                <EmojiPicker
                  open={showEmojiPicker}
                  position="above"
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
              className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
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
                className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                title="Forward to channel"
              >
                <Forward className="w-4 h-4" />
              </button>
            )}
            {/* Convert message → task: only the author of a regular (non-card)
                message can turn their own message into a Direct Assign card. */}
            {onDirectAssign && isOwner && !isDirectAssignCard && (
              <button
                onClick={() => onDirectAssign(message)}
                className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                title="Convert to Direct Assign task"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
            {isOwner && (
              <>
                <div className="w-px h-5 bg-slate-200" />
                <button
                  onClick={() => { setEditContent(editableText(message.content)); setEditing(true); setShowActions(false); }}
                  className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                  title="Edit message"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 sm:p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-r-lg transition-colors"
                  title="Delete message"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Team Members Popover — opened when a team mention chip is clicked. */}
      <TeamMembersPopover
        open={!!teamPopoverId}
        teamId={teamPopoverId}
        channelId={channelId}
        onClose={() => setTeamPopoverId(null)}
        onMemberClick={(userId) => {
          setTeamPopoverId(null);
          handleMentionClick(userId);
        }}
      />

      {/* Profile panel itself is mounted once at AppShell level — driven by
          the store. Here we just show a tiny corner spinner while we fetch. */}
      {profileLoading && (
        <div className="fixed top-4 right-4 z-[91] bg-white shadow-lg rounded-full p-2.5">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Lightbox — closes on ESC (document-level listener) and backdrop click */}
      <ImageLightbox src={lightboxUrl} images={lightboxGallery} onClose={() => setLightboxUrl(null)} />

      <DeleteMessageModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={performDelete}
        kind="message"
        preview={{
          senderName: message.sender.name,
          senderImage: message.sender.image,
          createdAt: message.createdAt,
          content: message.content,
          channelName,
        }}
      />
    </>
  );
}
