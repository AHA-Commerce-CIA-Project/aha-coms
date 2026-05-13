'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/use-auth';
import { useAuth } from '@/lib/auth/use-auth';
import { getCurrentPeriod, getPeriodLabel } from '@/lib/orbit-utils';
import {
  RotateCcw, CheckCircle2, Clock, User, Users, ArrowRight,
  Check, X, Send, Calendar, AlertCircle, Upload, Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageTabs } from '@/components/PageTabs';

interface Template {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  category: string | null;
  deadlineTime: string | null;
  deadlineDay: number | null;
  isTeamWide?: boolean;
  teamId?: string | null;
  teamIds?: string[];
  creator: { id: string; name: string };
}

interface Claim {
  id: string;
  templateId: string;
  claimedBy: string;
  period: string;
  status: string;
  completedAt: string | null;
  completionNote: string | null;
  claimer: { id: string; name: string; image: string | null };
}

interface Delegation {
  id: string;
  fromUser: { id: string; name: string; image: string | null };
  claim: {
    id: string;
    template: { id: string; name: string; frequency: string; category: string | null };
  };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

const FREQ_TABS = [
  { value: 'all', label: 'All' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const FREQ_COLORS: Record<string, string> = {
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-amber-100 text-amber-700',
};

export default function OrbitPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [activeTab, setActiveTab] = useState('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Delegation modal
  const [delegateClaimId, setDelegateClaimId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>('');

  // Completion modal
  const [completeClaimId, setCompleteClaimId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  // Team-wide task state
  const [teamWideMembers, setTeamWideMembers] = useState<Record<string, TeamMember[]>>({});
  const [teamWideDetail, setTeamWideDetail] = useState<string | null>(null);
  const [teamWideNote, setTeamWideNote] = useState('');

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
  }, [session, isPending, router]);

  const fetchData = useCallback(async () => {
    try {
      const [tRes, dRes] = await Promise.all([
        fetch('/api/orbit/templates'),
        fetch('/api/orbit/delegations'),
      ]);
      if (tRes.ok) setTemplates(await tRes.json());
      if (dRes.ok) setDelegations(await dRes.json());

      // Fetch claims for relevant periods
      if (activeTab === 'all') {
        const weeklyPeriod = getCurrentPeriod('weekly');
        const monthlyPeriod = getCurrentPeriod('monthly');
        const [wRes, mRes] = await Promise.all([
          fetch(`/api/orbit/claims?frequency=weekly&period=${weeklyPeriod}`),
          fetch(`/api/orbit/claims?frequency=monthly&period=${monthlyPeriod}`),
        ]);
        const wClaims = wRes.ok ? await wRes.json() : [];
        const mClaims = mRes.ok ? await mRes.json() : [];
        setClaims([...wClaims, ...mClaims]);
      } else {
        const period = getCurrentPeriod(activeTab);
        const cRes = await fetch(`/api/orbit/claims?frequency=${activeTab}&period=${period}`);
        if (cRes.ok) setClaims(await cRes.json());
      }
    } catch {} finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  // Fetch team members for delegation modal
  useEffect(() => {
    if (!delegateClaimId) return;
    fetch('/api/chat/users')
      .then((r) => r.ok ? r.json() : [])
      .then(setTeamMembers)
      .catch(() => {});
  }, [delegateClaimId]);

  // Fetch team members for team-wide templates
  useEffect(() => {
    const teamWideTemplates = templates.filter((t) => t.isTeamWide);
    if (teamWideTemplates.length === 0) return;

    fetch('/api/teams?include=members')
      .then((r) => r.ok ? r.json() : [])
      .then((teamsData: any[]) => {
        const membersByTemplate: Record<string, TeamMember[]> = {};
        teamWideTemplates.forEach((t) => {
          const tIds = Array.isArray(t.teamIds) && t.teamIds.length > 0
            ? t.teamIds
            : t.teamId ? [t.teamId] : [];

          // If no team IDs at all, this template is visible to all — use all teams' members
          const relevantTeams = tIds.length > 0
            ? teamsData.filter((team: any) => tIds.includes(team.id))
            : teamsData;

          const members: TeamMember[] = [];
          const seen = new Set<string>();
          relevantTeams.forEach((team: any) => {
            if (Array.isArray(team.members)) {
              team.members.forEach((m: any) => {
                if (!seen.has(m.id)) {
                  seen.add(m.id);
                  members.push({ id: m.id, name: m.name, email: m.email || '', image: m.image || null });
                }
              });
            }
          });
          membersByTemplate[t.id] = members;
        });
        setTeamWideMembers(membersByTemplate);
      })
      .catch(() => {});
  }, [templates]);

  const handleClaim = async (templateId: string) => {
    setActionLoading(templateId);
    try {
      const res = await fetch('/api/orbit/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (res.ok) fetchData();
      else {
        const data = await res.json();
        alert(data.error || 'Failed to claim');
      }
    } catch {} finally { setActionLoading(null); }
  };

  const handleComplete = async () => {
    if (!completeClaimId) return;
    setActionLoading(completeClaimId);
    try {
      const res = await fetch(`/api/orbit/claims/${completeClaimId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: completionNote }),
      });
      if (res.ok) {
        setCompleteClaimId(null);
        setCompletionNote('');
        fetchData();
      }
    } catch {} finally { setActionLoading(null); }
  };

  // Handle team-wide task: claim only (status: 'claimed')
  const handleTeamWideClaim = async (templateId: string) => {
    setActionLoading(templateId);
    try {
      const res = await fetch('/api/orbit/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to claim');
      }
    } catch {} finally { setActionLoading(null); }
  };

  // Handle team-wide task: mark a claimed task as complete
  const handleTeamWideMarkComplete = async (claimId: string) => {
    setActionLoading(claimId);
    try {
      const res = await fetch(`/api/orbit/claims/${claimId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: teamWideNote }),
      });
      if (res.ok) {
        setTeamWideNote('');
        setTeamWideDetail(null);
        fetchData();
      }
    } catch {} finally { setActionLoading(null); }
  };

  const handleDelegate = async () => {
    if (!delegateClaimId || !selectedMember) return;
    setActionLoading(delegateClaimId);
    try {
      const res = await fetch('/api/orbit/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: delegateClaimId, toUserId: selectedMember }),
      });
      if (res.ok) {
        setDelegateClaimId(null);
        setSelectedMember('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delegate');
      }
    } catch {} finally { setActionLoading(null); }
  };

  const handleDelegationResponse = async (delegationId: string, action: 'accept' | 'decline') => {
    setActionLoading(delegationId);
    try {
      await fetch(`/api/orbit/delegations/${delegationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchData();
    } catch {} finally { setActionLoading(null); }
  };

  if (isPending || !session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredTemplates = activeTab === 'all'
    ? templates.filter((t) => t.frequency === 'weekly' || t.frequency === 'monthly')
    : templates.filter((t) => t.frequency === activeTab);
  const periodLabel = activeTab === 'all'
    ? `${getPeriodLabel('weekly', getCurrentPeriod('weekly'))} / ${getPeriodLabel('monthly', getCurrentPeriod('monthly'))}`
    : getPeriodLabel(activeTab, getCurrentPeriod(activeTab));

  return (
    <div className="space-y-6">
      {/* Tabs — keep AHA Orbit reachable alongside My Tasks / Task Queue. */}
      <PageTabs tabs={[
        { href: '/tasks', label: 'My Tasks' },
        { href: '/my-request', label: 'My Request' },
        { href: '/nexus', label: 'Task Queue' },
        { href: '/team-inbox', label: 'Task Inbox' },
        { href: '/orbit', label: 'AHA Orbit' },
      ]} />
      {/* Cap the orbit content body at max-w-4xl so cards don't stretch across
          wide monitors. PageTabs stays outside this wrapper to preserve the
          left-aligned tab row used by the other Tasks-group pages. */}
      <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">AHA ORBIT</h1>
            <p className="text-sm text-slate-400">Organized Routine & Business Intelligence Tracker</p>
          </div>
        </div>
        {isLeader && (
          <button
            onClick={() => router.push('/orbit/manage')}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Manage Templates
          </button>
        )}
      </div>

      {/* Pending Delegations */}
      {delegations.length > 0 && (
        <div className="mb-6 space-y-2">
          {delegations.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    <strong>{d.fromUser.name}</strong> wants to delegate <strong>&quot;{d.claim.template.name}&quot;</strong> to you
                  </p>
                  <p className="text-xs text-slate-400 capitalize">{d.claim.template.frequency} task</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDelegationResponse(d.id, 'accept')}
                  disabled={actionLoading === d.id}
                  className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDelegationResponse(d.id, 'decline')}
                  disabled={actionLoading === d.id}
                  className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Frequency Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {FREQ_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveTab(tab.value); setLoading(true); }}
            className={cn(
              'px-5 py-2.5 text-sm rounded-xl font-medium transition-all',
              activeTab === tab.value
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-sm text-slate-400">{periodLabel}</span>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-20">
          <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No routine tasks{activeTab !== 'all' ? ` (${activeTab})` : ''}</h3>
          <p className="text-sm text-slate-400">
            {isLeader ? 'Go to Manage Templates to create routine tasks.' : 'No routine tasks have been created yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map((template) => {
            // Team-wide task rendering
            if (template.isTeamWide) {
              const members = teamWideMembers[template.id] || [];
              const templateClaims = claims.filter((c) => c.templateId === template.id);
              const completedClaims = templateClaims.filter((c) => c.status === 'completed');
              const completedCount = completedClaims.length;
              const totalMembers = members.length;
              const myClaim = templateClaims.find((c) => c.claimedBy === session.user.id);
              const myClaimCompleted = myClaim?.status === 'completed';
              const myClaimPending = myClaim && myClaim.status !== 'completed';
              const allDone = totalMembers > 0 && completedCount >= totalMembers;

              // Claimers for avatar stack
              const claimersWithAvatars = templateClaims.map((c) => c.claimer).filter(Boolean);
              const visibleAvatars = claimersWithAvatars.slice(0, 5);
              const extraCount = claimersWithAvatars.length - 5;

              return (
                <div
                  key={template.id}
                  onClick={() => setTeamWideDetail(template.id)}
                  className={cn(
                    'bg-white border rounded-xl p-5 transition-all cursor-pointer hover:shadow-md',
                    allDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold text-slate-800">{template.name}</h3>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', FREQ_COLORS[template.frequency] || 'bg-slate-100 text-slate-500')}>
                          {template.frequency}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                          Team-wide
                        </span>
                        {template.category && (
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                            {template.category}
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-slate-500 mb-1">{template.description}</p>
                      )}
                      {(template.deadlineTime || template.deadlineDay) && (
                        <p className="text-xs text-indigo-400 mb-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Due: {template.deadlineDay && template.frequency === 'weekly'
                            ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][template.deadlineDay] + ' '
                            : template.deadlineDay && template.frequency === 'monthly'
                              ? `Day ${template.deadlineDay} `
                              : ''
                          }{template.deadlineTime ? `at ${template.deadlineTime}` : ''}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-3 mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-600">
                            {completedCount}/{totalMembers} members completed
                          </span>
                          {allDone && (
                            <span className="text-xs font-medium text-emerald-600">All done!</span>
                          )}
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              allDone ? 'bg-emerald-500' : 'bg-amber-400'
                            )}
                            style={{ width: totalMembers > 0 ? `${(completedCount / totalMembers) * 100}%` : '0%' }}
                          />
                        </div>
                      </div>

                      {/* Action button */}
                      <div className="mt-3">
                        {myClaimCompleted ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" />
                            You completed this
                          </span>
                        ) : myClaimPending ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setTeamWideDetail(template.id); }}
                            className="px-4 py-2 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors"
                          >
                            Mark Complete
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTeamWideClaim(template.id); }}
                            disabled={actionLoading === template.id}
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === template.id ? 'Claiming...' : 'Claim'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Right side: Avatar stack of claimers */}
                    <div className="flex items-center flex-shrink-0 ml-4">
                      {claimersWithAvatars.length > 0 ? (
                        <div className="flex items-center">
                          <div className="flex -space-x-2">
                            {visibleAvatars.map((claimer, i) => (
                              claimer.image ? (
                                <img
                                  key={claimer.id}
                                  src={claimer.image}
                                  alt={claimer.name}
                                  title={claimer.name}
                                  className="w-7 h-7 rounded-full border-2 border-white object-cover"
                                  style={{ zIndex: 5 - i }}
                                />
                              ) : (
                                <div
                                  key={claimer.id}
                                  title={claimer.name}
                                  className="w-7 h-7 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600"
                                  style={{ zIndex: 5 - i }}
                                >
                                  {claimer.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                              )
                            ))}
                          </div>
                          {extraCount > 0 && (
                            <span className="ml-1 text-[10px] font-medium text-slate-500">+{extraCount}</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                          <Users className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // Regular (non-team-wide) task rendering
            const claim = claims.find((c) => c.templateId === template.id);
            const isOwner = claim?.claimedBy === session.user.id;
            const isClaimed = !!claim;
            const isCompleted = claim?.status === 'completed';

            return (
              <div
                key={template.id}
                className={cn(
                  'bg-white border rounded-xl p-5 transition-all',
                  isCompleted ? 'border-emerald-200 bg-emerald-50/30' :
                  isClaimed ? 'border-indigo-200' : 'border-slate-200'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-800">{template.name}</h3>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', FREQ_COLORS[template.frequency] || 'bg-slate-100 text-slate-500')}>
                        {template.frequency}
                      </span>
                      {template.category && (
                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                          {template.category}
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-slate-500 mb-1">{template.description}</p>
                    )}
                    {(template.deadlineTime || template.deadlineDay) && (
                      <p className="text-xs text-indigo-400 mb-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Due: {template.deadlineDay && template.frequency === 'weekly'
                          ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][template.deadlineDay] + ' '
                          : template.deadlineDay && template.frequency === 'monthly'
                            ? `Day ${template.deadlineDay} `
                            : ''
                        }{template.deadlineTime ? `at ${template.deadlineTime}` : ''}
                      </p>
                    )}

                    {/* Status */}
                    {isCompleted ? (
                      <div>
                        <div className="flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-medium">
                            Completed by {claim!.claimer.name}
                            {claim!.completedAt && (
                              <span className="text-slate-400 font-normal ml-1">
                                at {new Date(claim!.completedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {new Date(claim!.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </span>
                        </div>
                        {claim!.completionNote && (
                          <p className="text-xs text-slate-400 mt-1 ml-6 italic">&quot;{claim!.completionNote}&quot;</p>
                        )}
                      </div>
                    ) : isClaimed ? (
                      <div className="flex items-center gap-2 text-indigo-600">
                        <User className="w-4 h-4" />
                        <span className="text-xs font-medium">Claimed by {claim!.claimer.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs font-medium">Available to claim</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {!isClaimed && (
                      <button
                        onClick={() => handleClaim(template.id)}
                        disabled={actionLoading === template.id}
                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        Claim
                      </button>
                    )}
                    {isClaimed && isOwner && !isCompleted && (
                      <>
                        <button
                          onClick={() => { setCompleteClaimId(claim!.id); setCompletionNote(''); }}
                          disabled={actionLoading === claim!.id}
                          className="px-4 py-2 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => setDelegateClaimId(claim!.id)}
                          className="px-4 py-2 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-200 transition-colors"
                        >
                          Delegate
                        </button>
                      </>
                    )}
                    {isCompleted && (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Delegation Modal */}
      {delegateClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDelegateClaimId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Delegate Task</h3>
            <p className="text-sm text-slate-500 mb-4">Select a team member to delegate this task to:</p>

            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-4"
            >
              <option value="">Select member...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={handleDelegate}
                disabled={!selectedMember || actionLoading === delegateClaimId}
                className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                Delegate
              </button>
              <button
                onClick={() => { setDelegateClaimId(null); setSelectedMember(''); }}
                className="px-4 py-2.5 text-slate-500 hover:text-slate-700 font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {completeClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCompleteClaimId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Complete Task</h3>
            <p className="text-sm text-slate-500 mb-4">Add an optional comment about the completed task:</p>

            <textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="e.g. Updated all reports, sent to team..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={handleComplete}
                disabled={actionLoading === completeClaimId}
                className="flex-1 py-2.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm"
              >
                {actionLoading === completeClaimId ? 'Completing...' : 'Mark Complete'}
              </button>
              <button
                onClick={() => { setCompleteClaimId(null); setCompletionNote(''); }}
                className="px-4 py-2.5 text-slate-500 hover:text-slate-700 font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team-Wide Detail Modal */}
      {teamWideDetail && (() => {
        const template = templates.find((t) => t.id === teamWideDetail);
        if (!template) return null;
        const members = teamWideMembers[template.id] || [];
        const templateClaims = claims.filter((c) => c.templateId === template.id);
        const completedClaims = templateClaims.filter((c) => c.status === 'completed');
        const completedCount = completedClaims.length;
        const totalMembers = members.length;
        const myClaim = templateClaims.find((c) => c.claimedBy === session.user.id);
        const myClaimCompleted = myClaim?.status === 'completed';
        const myClaimPending = myClaim && myClaim.status !== 'completed';
        const progressPct = totalMembers > 0 ? (completedCount / totalMembers) * 100 : 0;
        const allDone = totalMembers > 0 && completedCount >= totalMembers;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setTeamWideDetail(null); setTeamWideNote(''); }} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{template.name}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', FREQ_COLORS[template.frequency] || 'bg-slate-100 text-slate-500')}>
                      {template.frequency}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                      Team-wide
                    </span>
                    {template.category && (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                        {template.category}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setTeamWideDetail(null); setTeamWideNote(''); }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {template.description && (
                <p className="text-sm text-slate-500 mb-3">{template.description}</p>
              )}

              {(template.deadlineTime || template.deadlineDay) && (
                <p className="text-xs text-indigo-400 mb-3 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Due: {template.deadlineDay && template.frequency === 'weekly'
                    ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][template.deadlineDay] + ' '
                    : template.deadlineDay && template.frequency === 'monthly'
                      ? `Day ${template.deadlineDay} `
                      : ''
                  }{template.deadlineTime ? `at ${template.deadlineTime}` : ''}
                </p>
              )}

              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600">
                    {completedCount}/{totalMembers} members completed
                  </span>
                  {allDone && (
                    <span className="text-xs font-medium text-emerald-600">All done!</span>
                  )}
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      allDone ? 'bg-emerald-500' : 'bg-amber-400'
                    )}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Member list */}
              <div className="space-y-2 mb-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team Members</h4>
                {members.map((member) => {
                  const memberClaim = templateClaims.find((c) => c.claimedBy === member.id);
                  const isCompleted = memberClaim?.status === 'completed';
                  const isClaimed = memberClaim && memberClaim.status !== 'completed';

                  return (
                    <div key={member.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="flex-shrink-0">
                        {member.image ? (
                          <img src={member.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {member.name}{member.id === session.user.id ? ' (You)' : ''}
                          </span>
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 flex-shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          ) : isClaimed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 flex-shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 flex-shrink-0">
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 inline-block" />
                              Not started
                            </span>
                          )}
                        </div>
                        {isCompleted && memberClaim?.completionNote && (
                          <p className="text-xs text-slate-400 italic mt-0.5">&quot;{memberClaim.completionNote}&quot;</p>
                        )}
                        {isCompleted && memberClaim?.completedAt && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(memberClaim.completedAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {new Date(memberClaim.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Show claimers not in the member list (edge case) */}
                {templateClaims
                  .filter((c) => !members.find((m) => m.id === c.claimedBy))
                  .map((c) => (
                    <div key={c.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="flex-shrink-0">
                        {c.claimer.image ? (
                          <img src={c.claimer.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                            {c.claimer.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {c.claimer.name}{c.claimedBy === session.user.id ? ' (You)' : ''}
                          </span>
                          {c.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 flex-shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 flex-shrink-0">
                              <Clock className="w-3.5 h-3.5" />
                              In Progress
                            </span>
                          )}
                        </div>
                        {c.status === 'completed' && c.completionNote && (
                          <p className="text-xs text-slate-400 italic mt-0.5">&quot;{c.completionNote}&quot;</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Current user action */}
              <div className="border-t border-slate-200 pt-4">
                {myClaimCompleted ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">You have completed this task</span>
                  </div>
                ) : myClaimPending ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">Mark as complete</p>
                    <textarea
                      value={teamWideNote}
                      onChange={(e) => setTeamWideNote(e.target.value)}
                      placeholder="Add a comment about your completion..."
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                    />
                    <button
                      onClick={() => handleTeamWideMarkComplete(myClaim!.id)}
                      disabled={actionLoading === myClaim!.id}
                      className="w-full py-2.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm"
                    >
                      {actionLoading === myClaim!.id ? 'Completing...' : 'Mark Complete'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleTeamWideClaim(template.id)}
                    disabled={actionLoading === template.id}
                    className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {actionLoading === template.id ? 'Claiming...' : 'Claim This Task'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
