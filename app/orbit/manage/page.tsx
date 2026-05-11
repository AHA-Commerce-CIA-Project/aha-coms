'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import { RotateCcw, Plus, Pencil, Trash2, ArrowLeft, User as UserIcon, Users, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { RoutineTemplateModal } from '@/components/orbit/RoutineTemplateModal';
import type { RoutineTemplateFormInitial, TemplateType } from '@/components/orbit/RoutineTemplateForm';

interface Template {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  category: string | null;
  type?: TemplateType;
  channelId?: string | null;
  channel?: { id: string; name: string } | null;
  mentionTarget?: string | null;
  checklistItems?: { id: string; title: string; position: number }[];
  isActive: boolean;
  creator: { id: string; name: string };
  team?: { id: string; name: string } | null;
  createdAt: string;
}

interface TeamOption { id: string; name: string }

const FREQ_COLORS: Record<string, string> = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-amber-100 text-amber-700',
};

export default function ManageOrbitPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoutineTemplateFormInitial | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
    if (!isPending && session && !isLeader) router.push('/orbit');
  }, [session, isPending, isLeader, router]);

  useEffect(() => {
    if (session && isLeader) {
      fetchTemplates();
      fetchTeams();
    }
  }, [session, isLeader]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/orbit/templates');
      if (res.ok) setTemplates(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data.map((t: any) => ({ id: t.id, name: t.name })));
      }
    } catch {}
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditing({
      id: t.id,
      name: t.name,
      description: t.description,
      frequency: t.frequency,
      category: t.category,
      type: t.type ?? ((t as any).isTeamWide ? 'TEAM' : 'INDIVIDUAL'),
      channelId: t.channelId,
      mentionTarget: t.mentionTarget,
      checklistItems: t.checklistItems,
      deadlineTime: (t as any).deadlineTime ?? null,
      deadlineDay: (t as any).deadlineDay ?? null,
      teamIds: Array.isArray((t as any).teamIds) && (t as any).teamIds.length > 0
        ? (t as any).teamIds
        : (t.team?.id ? [t.team.id] : []),
      isTeamWide: !!(t as any).isTeamWide,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this routine task template?')) return;
    await fetch(`/api/orbit/templates/${id}`, { method: 'DELETE' });
    fetchTemplates();
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/orbit" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Manage Routine Tasks</h1>
            <p className="text-sm text-slate-400">Create and manage routine task templates</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-600 mb-1">No templates yet</h3>
          <p className="text-sm text-slate-400">Create your first routine task template.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-indigo-200 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-semibold text-sm text-slate-800">{t.name}</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', FREQ_COLORS[t.frequency])}>
                    {t.frequency}
                  </span>
                  {t.category && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">{t.category}</span>
                  )}
                  {(t.type === 'TEAM' || (t as any).isTeamWide) ? (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> Team
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium inline-flex items-center gap-1">
                      <UserIcon className="w-3 h-3" /> Individual
                    </span>
                  )}
                  {t.channel && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium inline-flex items-center gap-0.5">
                      <Hash className="w-3 h-3" />{t.channel.name}
                    </span>
                  )}
                  {(() => {
                    const ids = Array.isArray((t as any).teamIds) ? (t as any).teamIds as string[] : [];
                    if (ids.length > 0) {
                      return ids.map((id: string) => {
                        const team = teams.find((tm) => tm.id === id);
                        return (
                          <span key={id} className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                            {team?.name || id.slice(0, 8)}
                          </span>
                        );
                      });
                    }
                    if (t.team) {
                      return (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">{t.team.name}</span>
                      );
                    }
                    return (
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">All Teams</span>
                    );
                  })()}
                </div>
                {t.description && <p className="text-xs text-slate-400 truncate">{t.description}</p>}
                {((t as any).deadlineTime || (t as any).deadlineDay) && (
                  <p className="text-xs text-indigo-400 mt-0.5">
                    Due: {(t as any).deadlineDay && t.frequency === 'weekly'
                      ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(t as any).deadlineDay] + ' '
                      : (t as any).deadlineDay && t.frequency === 'monthly'
                        ? `Day ${(t as any).deadlineDay} `
                        : ''
                    }{(t as any).deadlineTime ? `at ${(t as any).deadlineTime}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => openEdit(t)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RoutineTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchTemplates}
        initial={editing}
      />
    </div>
  );
}
