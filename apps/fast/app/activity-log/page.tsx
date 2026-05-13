'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/use-auth';
import { useAuth } from '@/lib/auth/use-auth';
import {
  Activity, Search, CheckCircle2, MessageSquare, RotateCcw,
  FileText, User, Clock, ChevronLeft, ChevronRight,
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

import { Lock, UserPlus, UserCheck, UserX, Shield, Trash2, Pencil, MailCheck } from 'lucide-react';

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
  user_created: { icon: UserPlus, color: 'text-cyan-500 bg-cyan-50', label: 'User Created' },
  user_updated: { icon: Pencil, color: 'text-orange-500 bg-orange-50', label: 'User Updated' },
  user_deleted: { icon: Trash2, color: 'text-rose-500 bg-rose-50', label: 'User Deleted' },
  user_confirmed: { icon: MailCheck, color: 'text-teal-500 bg-teal-50', label: 'Email Confirmed' },
  direct_request_approved: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50', label: 'Direct Request Approved' },
  direct_request_declined: { icon: UserX, color: 'text-rose-500 bg-rose-50', label: 'Direct Request Declined' },
  direct_request_delegated: { icon: RotateCcw, color: 'text-purple-500 bg-purple-50', label: 'Direct Request Delegated' },
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
  { value: 'user_created', label: 'User Created' },
  { value: 'user_updated', label: 'User Updated' },
  { value: 'user_deleted', label: 'User Deleted' },
  { value: 'user_confirmed', label: 'Email Confirmed' },
  { value: 'direct_request_approved', label: 'Direct Request Approved' },
  { value: 'direct_request_declined', label: 'Direct Request Declined' },
  { value: 'direct_request_delegated', label: 'Direct Request Delegated' },
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

const ITEMS_PER_PAGE = 15;

export default function ActivityLogPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    if (!isPending && !session) window.location.href = '/portal?app=fast';
    if (!isPending && session && !isLeader) router.push('/');
  }, [session, isPending, isLeader, router]);

  const fetchLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', String(ITEMS_PER_PAGE));
      if (actionFilter) params.set('action', actionFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/fast/api/activity-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPage(data.page);
      }
    } catch {} finally { setLoading(false); }
  }, [actionFilter, searchQuery]);

  useEffect(() => {
    if (session && isLeader) fetchLogs(1);
  }, [session, isLeader, fetchLogs]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs(1);
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    fetchLogs(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

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
          <p className="text-sm text-slate-400">
            {total > 0 ? `${total} total entries` : 'Chronological history of all team actions'}
          </p>
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
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search activity..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); }}
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
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No activity found</h3>
          <p className="text-sm text-slate-400">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <div className={cn(loading && 'opacity-50 pointer-events-none transition-opacity')}>
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
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>

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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
              <p className="text-sm text-slate-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {getPageNumbers().map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-slate-400 text-sm">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={cn(
                        'w-9 h-9 rounded-lg text-sm font-medium transition-colors',
                        p === page
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
