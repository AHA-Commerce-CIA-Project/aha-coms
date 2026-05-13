'use client';

import { useState, useRef, useEffect } from 'react';
import { Hash, Search, X, Lock, Users, Crown, MoreVertical, Trash2, Pencil, UserPlus, UserMinus, ClipboardList, ArrowLeft, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddChannelMembersModal } from './AddChannelMembersModal';

interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  isCreator: boolean;
}

interface ChannelHeaderProps {
  name: string;
  description: string | null;
  isPrivate?: boolean;
  memberCount?: number;
  channelId?: string;
  /** 'discussion' | 'assign_task' — controls whether the Direct Assign button appears. */
  purpose?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searching: boolean;
  isCreator?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onDirectAssign?: () => void;
  /** True when the current user has this channel pinned to their sidebar. */
  isPinnedForUser?: boolean;
  /** Toggle the user-specific pin. Visible in the kebab menu for every
   *  member when provided (pinning is per-user, not a creator action). */
  onPinChannel?: () => void;
  /** Mobile-only: back to the channel list. Renders an arrow button when set. */
  onBack?: () => void;
}

export function ChannelHeader({ name, description, isPrivate, memberCount, channelId, purpose, searchQuery, onSearchChange, searching, isCreator, onDelete, onEdit, onDirectAssign, isPinnedForUser, onPinChannel, onBack }: ChannelHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSearch) {
      inputRef.current?.focus();
    }
  }, [showSearch]);

  // Close members dropdown on click outside
  useEffect(() => {
    if (!showMembers) return;
    const handleClick = (e: MouseEvent) => {
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) {
        setShowMembers(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMembers]);

  // Close kebab menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handleToggleMembers = async () => {
    if (showMembers) {
      setShowMembers(false);
      return;
    }
    if (!channelId) return;

    setShowMembers(true);
    setLoadingMembers(true);
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch {
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleClose = () => {
    setShowSearch(false);
    onSearchChange('');
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!channelId) return;
    if (!confirm(`Remove ${memberName} from this channel?`)) return;
    try {
      const res = await fetch(`/fast/api/channels/${channelId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberId }),
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch {}
  };

  return (
    // Outer chrome (padding-y, border-b, bg) is provided by the parent row
    // in MessagesWorkspace — this header is no longer a self-contained band.
    <div className="flex items-center justify-between gap-2 sm:gap-3 w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile-only back arrow — returns to the channel list. Hidden on
            desktop where the channel rail is always visible. */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Back to channels"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        {isPrivate ? (
          <Lock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        ) : (
          <Hash className="w-5 h-5 text-indigo-600 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800 truncate">{name}</h2>
          {description && (
            <p className="text-xs text-slate-400 truncate">{description}</p>
          )}
        </div>
      </div>

      {showSearch ? (
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              onKeyDown={(e) => e.key === 'Escape' && handleClose()}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {/* Direct Assign button — only on assign_task channels. */}
          {purpose === 'assign_task' && onDirectAssign && (
            <button
              type="button"
              onClick={onDirectAssign}
              className="flex items-center gap-1.5 px-3 py-1.5 mr-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
              title="Post a task into this channel"
            >
              <ClipboardList className="w-4 h-4" />
              <span>Direct Assign</span>
            </button>
          )}
          {/* Member count button */}
          {memberCount !== undefined && (
            <div className="relative" ref={membersRef}>
              <button
                onClick={handleToggleMembers}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors',
                  showMembers
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                )}
                title="View members"
              >
                <Users className="w-4 h-4" />
                <span className="text-xs font-medium">{memberCount}</span>
              </button>

              {/* Members dropdown — Slack-style polish */}
              {showMembers && (
                <div className="absolute right-0 top-full mt-2 w-[320px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-800">Members</h3>
                      <span className="text-xs font-semibold text-slate-400">{members.length}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMembers(false);
                        setAddMembersOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Add people from any team"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto py-1">
                    {loadingMembers ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      members.map((member) => (
                        <div
                          key={member.id}
                          className="group/row flex items-center gap-3 px-3 mx-1 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold overflow-hidden">
                            {member.image ? (
                              <img
                                src={member.image}
                                alt={member.name}
                                className="w-9 h-9 rounded-md object-cover"
                              />
                            ) : (
                              member.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {member.name}
                              </span>
                              {member.isCreator && (
                                <span title="Channel creator"><Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate">{member.email}</p>
                          </div>
                          {!member.isCreator && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveMember(member.id, member.name);
                              }}
                              className="opacity-0 group-hover/row:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all flex-shrink-0"
                              title={`Remove ${member.name} from channel`}
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowSearch(true)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            title="Search messages"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Kebab menu — shown for any member when Pin/Unpin is available;
              Edit/Delete items only render for the channel creator. */}
          {(onPinChannel || (isCreator && (onEdit || onDelete))) && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showMenu
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                )}
                title="More actions"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-2 w-[200px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  {onPinChannel && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onPinChannel();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      {isPinnedForUser ? (
                        <PinOff className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Pin className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="font-medium">
                        {isPinnedForUser ? 'Unpin from sidebar' : 'Pin to sidebar'}
                      </span>
                    </button>
                  )}
                  {isCreator && onEdit && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onEdit();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      <Pencil className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">Edit channel</span>
                    </button>
                  )}
                  {isCreator && onDelete && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onDelete();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="font-medium">Delete channel</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AddChannelMembersModal
        open={addMembersOpen}
        channelId={channelId || null}
        channelName={name}
        existingMemberIds={members.map((m) => m.id)}
        onClose={() => setAddMembersOpen(false)}
        onAdded={() => {
          // Refresh member list after adding so the new people show up.
          if (channelId) {
            fetch(`/fast/api/channels/${channelId}/members`)
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => { if (data) setMembers(data); });
          }
        }}
      />
    </div>
  );
}
