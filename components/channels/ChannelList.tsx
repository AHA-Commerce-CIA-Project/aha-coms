'use client';

import { useState } from 'react';
import { Hash, Plus, Search, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export function ChannelList({
  channels,
  selectedId,
  onSelect,
  onCreateChannel,
  isLeader,
  loading,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = channels.filter((ch) =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Channels</h2>
        {(
          <button
            onClick={onCreateChannel}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            title="Create channel"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

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
                {channel.description && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {channel.description}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
