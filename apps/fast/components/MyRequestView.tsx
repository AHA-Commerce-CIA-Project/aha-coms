'use client';

// MyRequestView — tasks the current user posted into channels via Direct
// Assign, surfaced as a top-level Tasks tab. Same data + behavior as the
// former "Posted Cards" Later tab (GET /api/tasks/posted-cards); just lives
// under /my-request now so it sits next to My Tasks / Task Queue.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/use-auth';
import { Send, Hash, Inbox, ExternalLink, Lock, CheckCircle2, Clock, PauseCircle } from 'lucide-react';

interface PostedCardItem {
  id: string;
  title: string;
  status: string;
  urgency: string | null;
  task_token: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  due_date: string | null;
  claimer_name: string | null;
  claimer_image: string | null;
  target_channel_id: string | null;
  channel_message_id: string | null;
  channel_name: string | null;
  channel_is_private: boolean | null;
}

const statusColor: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600',
  'in-progress': 'bg-indigo-50 text-indigo-600',
  review: 'bg-purple-50 text-purple-600',
  done: 'bg-emerald-50 text-emerald-600',
  pending_completion_details: 'bg-amber-50 text-amber-600',
};

const urgencyColor: Record<string, string> = {
  P1: 'bg-rose-50 text-rose-600',
  P2: 'bg-orange-50 text-orange-600',
  P3: 'bg-amber-50 text-amber-600',
  P4: 'bg-emerald-50 text-emerald-600',
  '5-minute': 'bg-sky-50 text-sky-600',
};

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MyRequestView() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [cards, setCards] = useState<PostedCardItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'todo' | 'in-progress' | 'pending' | 'done'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isPending && !session) window.location.href = '/portal?app=fast';
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/fast/api/tasks/posted-cards');
        if (res.ok) setCards(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [session]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Send className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Request</h1>
          <p className="text-sm text-slate-400">Tasks you posted to other divisions — track who claimed and completed each one.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No requests yet</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Cards you post into channels via Direct Assign show up here so you can track who claimed and completed each one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { key: 'all',         label: 'Total',       count: cards.length,                                                color: 'text-slate-700' },
              { key: 'todo',        label: 'Open',        count: cards.filter(c => c.status === 'todo').length,               color: 'text-sky-500' },
              { key: 'in-progress', label: 'In Progress', count: cards.filter(c => c.status === 'in-progress').length,        color: 'text-indigo-500' },
              { key: 'pending',     label: 'Pending',     count: cards.filter(c => c.status === 'pending').length,            color: 'text-amber-500' },
              { key: 'done',        label: 'Done',        count: cards.filter(c => c.status === 'done').length,               color: 'text-emerald-500' },
            ].map(kpi => (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setFilter(kpi.key as typeof filter)}
                className={`bg-white border rounded-xl p-3 text-left transition-colors ${
                  filter === kpi.key ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className={`text-xl sm:text-2xl font-bold ${kpi.color}`}>{kpi.count}</p>
                <p className="text-[11px] sm:text-xs text-slate-500 leading-tight">{kpi.label}</p>
              </button>
            ))}
          </div>

          <ul className="space-y-2.5">
            {cards
              .filter(c => filter === 'all' || c.status === filter)
              .map(card => {
                const urgencyCls = (card.urgency && urgencyColor[card.urgency]) || 'bg-slate-100 text-slate-600';
                const StatusIcon = card.status === 'done' ? CheckCircle2
                  : card.status === 'pending' ? PauseCircle
                  : card.status === 'in-progress' ? Clock
                  : Inbox;
                const statusLabel = card.status === 'done' ? 'Completed'
                  : card.status === 'in-progress' ? 'In Progress'
                  : card.status === 'pending' ? 'Pending'
                  : card.status === 'todo' ? 'Open'
                  : card.status;
                const statusCls = statusColor[card.status] || 'bg-slate-100 text-slate-600';
                const goToCard = () => {
                  if (!card.target_channel_id) return;
                  const params = new URLSearchParams({ task: card.id, purpose: 'assign_task', channel: card.target_channel_id });
                  if (card.channel_message_id) params.set('highlight', card.channel_message_id);
                  router.push(`/messages?${params.toString()}`);
                };
                return (
                  <li
                    key={card.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                    onClick={goToCard}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {card.urgency && (
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${urgencyCls}`}>{card.urgency}</span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${statusCls}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusLabel}
                      </span>
                      {card.task_token && (
                        <span className="ml-auto font-mono text-[11px] text-indigo-500">{card.task_token}</span>
                      )}
                    </div>

                    <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words">{card.title}</h3>

                    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                      <div>
                        <dt className="text-slate-400">Channel</dt>
                        <dd className="text-slate-700 font-medium truncate flex items-center gap-1">
                          {card.channel_is_private ? <Lock className="w-3 h-3 text-indigo-400" /> : <Hash className="w-3 h-3 text-indigo-400" />}
                          {card.channel_name || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Claimed by</dt>
                        <dd className="text-slate-700 font-medium truncate">
                          {card.claimer_name || <span className="italic text-amber-600 font-normal">Unclaimed</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Posted</dt>
                        <dd className="text-slate-700">{formatRelativeTime(card.created_at)}</dd>
                      </div>
                    </dl>

                    <div className="flex items-center justify-end mt-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); goToCard(); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open in channel
                      </button>
                    </div>
                  </li>
                );
              })}
            {cards.filter(c => filter === 'all' || c.status === filter).length === 0 && (
              <li className="text-center py-8 text-sm text-slate-400">No cards match this filter.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
