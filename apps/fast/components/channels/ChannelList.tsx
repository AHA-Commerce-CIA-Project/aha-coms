'use client';

import { useState } from 'react';
import { Hash, Plus, Search, Lock, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDrafts } from '@/lib/useDrafts';

interface Channel {
  id: string;
  name: string;
  description: string | null;
  creator: { id: string; name: string };
  _count: { messages: number };
  updatedAt: string;
  unreadCount?: number;
  isPrivate?: boolean;
}

interface ChannelListProps {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (channel: Channel) => void;
  onCreateChannel: () => void;
  isLeader: boolean;
  loading: boolean;
  purpose?: 'discussion' | 'assign_task';
  purposeUnread?: { discussion: number; assign_task: number };
  onPurposeChange?: (purpose: 'discussion' | 'assign_task') => void;
}

export function ChannelList({
  channels,
  selectedId,
  onSelect,
  onCreateChannel,
  isLeader,
  loading,
  purpose,
  purposeUnread,
  onPurposeChange,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const draftIds = useDrafts();

  const filtered = channels.filter((ch) =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">
          {purpose === 'assign_task' ? 'Assign Task' : 'Channels'}
        </h2>
        <button
          onClick={onCreateChannel}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          title={purpose === 'assign_task' ? 'Create Assign Task channel' : 'Create channel'}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Purpose toggle — renders only when a handler is provided. */}
      {onPurposeChange && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onPurposeChange('discussion')}
              className={cn(
                'relative flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5',
                purpose === 'discussion'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Channels
              {purposeUnread && purposeUnread.discussion > 0 && purpose !== 'discussion' && (
                <span className="min-w-[16px] h-4 px-1 inline-flex items-center justify-center text-[9px] font-bold bg-rose-500 text-white rounded-full">
                  {purposeUnread.discussion > 99 ? '99+' : purposeUnread.discussion}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onPurposeChange('assign_task')}
              className={cn(
                'relative flex-1 px-2 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center justify-center gap-1.5',
                purpose === 'assign_task'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Assign Task
              {purposeUnread && purposeUnread.assign_task > 0 && purpose !== 'assign_task' && (
                <span className="min-w-[16px] h-4 px-1 inline-flex items-center justify-center text-[9px] font-bold bg-rose-500 text-white rounded-full">
                  {purposeUnread.assign_task > 99 ? '99+' : purposeUnread.assign_task}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find a channel..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            {searchQuery ? 'No channels found' : 'No channels yet'}
          </div>
        ) : (
          filtered.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelect(channel)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-100',
                selectedId === channel.id
                  ? 'bg-indigo-50 border-l-2 border-l-indigo-600'
                  : 'hover:bg-slate-50'
              )}
            >
              {channel.isPrivate ? (
                <Lock
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    selectedId === channel.id ? 'text-indigo-600' : 'text-slate-400'
                  )}
                />
              ) : (
                <Hash
                  className={cn(
                    'w-5 h-5 flex-shrink-0',
                    selectedId === channel.id ? 'text-indigo-600' : 'text-slate-400'
                  )}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'font-semibold text-sm truncate',
                      selectedId === channel.id ? 'text-indigo-600' : 'text-slate-700',
                      channel.unreadCount && channel.unreadCount > 0 ? 'font-bold' : ''
                    )}
                  >
                    {channel.name}
                  </span>
                  {channel.unreadCount && channel.unreadCount > 0 ? (
                    <span className="min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                      {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
                    </span>
                  ) : null}
                </div>
                {draftIds.has(channel.id) ? (
                  <p className="text-xs italic text-rose-500 font-medium truncate mt-0.5 flex items-center gap-1">
                    <Pencil className="w-3 h-3" />
                    draft
                  </p>
                ) : channel.description ? (
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {channel.description}
                  </p>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
