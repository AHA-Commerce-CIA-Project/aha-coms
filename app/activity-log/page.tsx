'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import {
  Activity, Search, Filter, CheckCircle2, MessageSquare, RotateCcw,
  FileText, User, Clock, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  action: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user: { id: string; name: string; image: string | null; role: string };
}

import { Lock, UserPlus, UserCheck, UserX, Shield, ImageIcon } from 'lucide-react';

const ACTION_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  task_claimed: { icon: User, color: 'text-indigo-500 bg-indigo-50', label: 'Task Claimed' },
  task_completed: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50', label: 'Task Completed' },
  channel_message: { icon: MessageSquare, color: 'text-blue-500 bg-blue-50', label: 'Channel Message' },
  orbit_claimed: { icon: RotateCcw, color: 'text-purple-500 bg-purple-50', label: 'Routine Claimed' },
  orbit_completed: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50', label: 'Routine Completed' },
  request_submitted: { icon: FileText, color: 'text-amber-500 bg-amber-50', label: 'Request Submitted' },
  user_registered: { icon: UserPlus, color: 'text-sky-500 bg-sky-50', label: 'User Registered' },
  account_activated: { icon: UserCheck, color: 'text-teal-500 bg-teal-50', label: 'Account Activated' },
  user_approved: { icon: Shield, color: 'text-emerald-500 bg-emerald-50', label: 'User Approved' },
  user_rejected: { icon: UserX, color: 'text-rose-500 bg-rose-50', label: 'User Rejected' },
  password_changed: { icon: Lock, color: 'text-amber-500 bg-amber-50', label: 'Password Changed' },
  profile_updated: { icon: User, color: 'text-violet-500 bg-violet-50', label: 'Profile Updated' },
};

const ACTION_FILTERS = [
  { value: '', label: 'All Actions' },
  { value: 'task_claimed', label: 'Task Claimed' },
  { value: 'task_completed', label: 'Task Completed' },
  { value: 'channel_message', label: 'Channel Message' },
  { value: 'orbit_claimed', label: 'Routine Claimed' },
  { value: 'orbit_completed', label: 'Routine Completed' },
  { value: 'request_submitted', label: 'Request Submitted' },
  { value: 'user_registered', label: 'User Registered' },
  { value: 'account_activated', label: 'Account Activated' },
  { value: 'user_approved', label: 'User Approved' },
  { value: 'user_rejected', label: 'User Rejected' },
  { value: 'password_changed', label: 'Password Changed' },
  { value: 'profile_updated', label: 'Profile Updated' },
];

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function ActivityLogPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
    if (!isPending && session && !isLeader) router.push('/');
  }, [session, isPending, isLeader, router]);

  const fetchLogs = useCallback(async (cursor?: string, reset = false) => {
    if (!reset && !cursor) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (actionFilter) params.set('action', actionFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/activity-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (reset || !cursor) {
          setLogs(data.logs);
        } else {
          setLogs((prev) => [...prev, ...data.logs]);
        }
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch {} finally { setLoading(false); }
  }, [actionFilter, searchQuery]);

  useEffect(() => {
    if (session && isLeader) fetchLogs(undefined, true);
  }, [session, isLeader, fetchLogs]);

  // Group logs by date
  const groupedLogs: { date: string; entries: LogEntry[] }[] = [];
  let lastDate = '';
  for (const log of logs) {
    const date = new Date(log.createdAt).toDateString();
    if (date !== lastDate) {
      groupedLogs.push({ date: log.createdAt, entries: [] });
      lastDate = date;
    }
    groupedLogs[groupedLogs.length - 1].entries.push(log);
  }

  if (isPending || !session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Activity className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Activity Log</h1>
          <p className="text-sm text-slate-400">Chronological history of all team actions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs(undefined, true)}
            placeholder="Search activity..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        >
          {ACTION_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Log Timeline */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No activity yet</h3>
          <p className="text-sm text-slate-400">Actions will appear here as team members use the platform.</p>
        </div>
      ) : (
        <div>
          {groupedLogs.map((group, gi) => (
            <div key={gi}>
              {/* Date divider */}
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs font-medium text-slate-400">{formatDateDivider(group.date)}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Entries */}
              <div className="space-y-1">
                {group.entries.map((log) => {
                  const config = ACTION_CONFIG[log.action] || { icon: Activity, color: 'text-slate-400 bg-slate-50', label: log.action };
                  const Icon = config.icon;

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      {/* Icon */}
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700">{log.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-slate-400">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatTime(log.createdAt)}
                          </span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', config.color)}>
                            {config.label}
                          </span>
                        </div>
                      </div>

                      {/* User avatar */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                          {log.user.image ? (
                            <img src={log.user.image} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            log.user.name.charAt(0).toUpperCase()
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="text-center py-6">
              <button
                onClick={() => fetchLogs(nextCursor || undefined)}
                className="px-6 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
