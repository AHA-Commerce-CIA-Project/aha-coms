'use client';

import { useState, useRef, useEffect } from 'react';
import { Hash, Search, X, Lock, Users, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searching: boolean;
}

export function ChannelHeader({ name, description, isPrivate, memberCount, channelId, searchQuery, onSearchChange, searching }: ChannelHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const membersRef = useRef<HTMLDivElement>(null);

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

  const handleToggleMembers = async () => {
    if (showMembers) {
      setShowMembers(false);
      return;
    }
    if (!channelId) return;

    setShowMembers(true);
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/members`);
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

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white gap-3">
      <div className="flex items-center gap-2 min-w-0">
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

              {/* Members dropdown */}
              {showMembers && (
                <div className="absolute right-0 top-full mt-2 w-[280px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-700">
                      Members ({members.length})
                    </h3>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {loadingMembers ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                            {member.image ? (
                              <img
                                src={member.image}
                                alt={member.name}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              member.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-slate-700 truncate">
                                {member.name}
                              </span>
                              {member.isCreator && (
                                <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Channel creator" />
                              )}
                              {(member.role === 'leader' || member.role === 'admin') && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium flex-shrink-0">
                                  {member.role}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate">{member.email}</p>
                          </div>
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
        </div>
      )}
    </div>
  );
}
