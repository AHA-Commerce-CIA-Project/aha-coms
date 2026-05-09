'use client';

import { useEffect, useState } from 'react';
import { X, MessageSquare, Clock, Mail, Star, UserPlus } from 'lucide-react';
import { htmlToPlainText } from '@/lib/sanitize';
import type { UserProfile } from '@/lib/user-profile-types';
import { getPresence } from '@/lib/presence';

export type { UserProfile };

interface RecentDm {
  id: string;
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

interface UserProfilePanelProps {
  user: UserProfile | null;
  currentUserId: string;
  onClose: () => void;
  /** When true, show the "Add people to this conversation" CTA that redirects to channel creation. */
  showAddToConversation?: boolean;
  /** When true, hide the "Send Direct Message" CTA (e.g., the viewer is already in a DM with this user). */
  hideSendDm?: boolean;
}

function formatActive(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) return '0m';
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function UserProfilePanel({ user, currentUserId, onClose, showAddToConversation = false, hideSendDm = false }: UserProfilePanelProps) {
  const [recentDm, setRecentDm] = useState<RecentDm | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [user, onClose]);

  // Fetch recent 1-on-1 DM thread with this user (if any).
  useEffect(() => {
    if (!user || user.id === currentUserId) {
      setRecentDm(null);
      return;
    }
    let cancelled = false;
    setRecentLoading(true);
    fetch('/api/chat/conversations')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; otherUser: { id: string } | null; lastMessage: RecentDm['lastMessage']; unreadCount: number }>) => {
        if (cancelled) return;
        const match = list.find((c) => c.otherUser?.id === user.id);
        if (match) {
          setRecentDm({ id: match.id, lastMessage: match.lastMessage, unreadCount: match.unreadCount });
        } else {
          setRecentDm(null);
        }
      })
      .catch(() => {
        if (!cancelled) setRecentDm(null);
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, currentUserId]);

  if (!user) return null;

  const presence = getPresence(user.lastSeenAt);

  const roleBadge =
    user.role === 'admin'
      ? 'bg-purple-100 text-purple-700'
      : user.role === 'leader'
      ? 'bg-indigo-100 text-indigo-700'
      : 'bg-slate-100 text-slate-600';

  const roleLabel =
    user.role === 'admin' ? 'Master' : user.role === 'leader' ? 'Leader' : 'Member';

  const isSelf = user.id === currentUserId;

  return (
    <aside
      className="fixed top-16 right-0 bottom-0 w-full sm:w-[380px] bg-white shadow-2xl border-l border-slate-200 z-[90] flex flex-col"
      role="dialog"
      aria-label="User profile"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
        <h2 className="text-base font-bold text-slate-800">Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          aria-label="Close profile panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Avatar — large square */}
        <div className="px-5 pt-5">
          <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white text-7xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-2xl font-bold text-slate-900">{user.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${roleBadge}`}>
              {roleLabel}
            </span>
          </div>
          {user.teamName && (
            <p className="text-sm text-slate-500">Team · {user.teamName}</p>
          )}
        </div>

        {/* 3-stat row */}
        <div className="mx-5 mt-4 grid grid-cols-3 border-y border-slate-200 py-3 text-center">
          <div>
            <p className="text-lg font-bold text-sky-600">
              {formatActive(user.activeSecondsToday)}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">
              Active Today
            </p>
          </div>
          <div className="border-x border-slate-200">
            <p className="text-lg font-bold text-emerald-600">{user.tasksDone}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">
              Tasks Done
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-500 flex items-center justify-center gap-1">
              {user.avgRating ?? '—'}
              {user.avgRating !== null && <Star className="w-4 h-4 fill-amber-500" />}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">
              {user.ratingCount > 0
                ? `${user.ratingCount} Rating${user.ratingCount === 1 ? '' : 's'}`
                : 'Rating'}
            </p>
          </div>
        </div>

        {/* Status meta */}
        <div className="px-5 py-4 space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${presence.dot}`} />
            <span className={presence.color}>{presence.label}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>
              {new Date(Date.now() + 7 * 3600000).toISOString().substring(11, 16)} WIB
              local time
            </span>
          </div>
        </div>

        {/* CTAs — Send DM and/or Add people to conversation */}
        {!isSelf && (!hideSendDm || showAddToConversation) && (
          <div className="px-5 pb-4 space-y-2">
            {!hideSendDm && (
              <a
                href={`/messages?with=${user.id}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors shadow-sm"
              >
                <MessageSquare className="w-4 h-4" /> Send Direct Message
              </a>
            )}
            {showAddToConversation && (
              <a
                href={`/messages?createWith=${user.id}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-semibold rounded-lg transition-colors"
              >
                <UserPlus className="w-4 h-4" /> Add people to this conversation
              </a>
            )}
          </div>
        )}

        {/* Contact section */}
        <div className="border-t border-slate-100 px-5 py-4">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            Contact information
          </h4>
          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Email Address</p>
              <a
                href={`mailto:${user.email}`}
                className="text-sm text-indigo-600 hover:underline break-all"
              >
                {user.email}
              </a>
            </div>
          </div>
        </div>

        {/* Recent DMs section — shows the 1-on-1 thread between viewer and this user, if any */}
        {!isSelf && (
          <div className="border-t border-slate-100 px-5 py-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
              Recent DMs
            </h4>
            {recentLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentDm ? (
              <a
                href={`/messages?with=${user.id}`}
                className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-md bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt={user.name} className="w-9 h-9 rounded-md object-cover" />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-800 truncate">{user.name}</span>
                    {recentDm.lastMessage && (
                      <span className="text-[11px] text-slate-400 flex-shrink-0">
                        {formatRelative(recentDm.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  {recentDm.lastMessage ? (
                    <p className="text-xs text-slate-500 truncate">
                      {recentDm.lastMessage.senderId === currentUserId ? 'You: ' : ''}
                      {htmlToPlainText(recentDm.lastMessage.content) || '(attachment)'}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No messages yet</p>
                  )}
                </div>
                {recentDm.unreadCount > 0 && (
                  <span className="ml-1 mt-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold text-white bg-rose-500 rounded-full flex-shrink-0">
                    {recentDm.unreadCount > 99 ? '99+' : recentDm.unreadCount}
                  </span>
                )}
              </a>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No DMs yet. Send the first message to start a conversation.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
