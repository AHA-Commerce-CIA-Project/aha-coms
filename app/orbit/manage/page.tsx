'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import { RotateCcw, Plus, Pencil, Trash2, X, ArrowLeft, User as UserIcon, Users, Hash, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type TemplateType = 'INDIVIDUAL' | 'TEAM';

interface TemplateChecklistItem {
  // id is omitted for newly-added rows so the PUT route creates them fresh.
  id?: string;
  title: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  category: string | null;
  type?: TemplateType;
  channelId?: string | null;
  channel?: { id: string; name: string } | null;
  checklistItems?: { id: string; title: string; position: number }[];
  isActive: boolean;
  creator: { id: string; name: string };
  team?: { id: string; name: string } | null;
  createdAt: string;
}

interface TeamOption {
  id: string;
  name: string;
}

interface ChannelOption {
  id: string;
  name: string;
}

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
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<TemplateType>('INDIVIDUAL');
  const [channelId, setChannelId] = useState<string>('');
  const [checklist, setChecklist] = useState<TemplateChecklistItem[]>([]);
  const [deadlineTime, setDeadlineTime] = useState('');
  const [deadlineDay, setDeadlineDay] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [isTeamWide, setIsTeamWide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPending && !session) router.push('/login');
    if (!isPending && session && !isLeader) router.push('/orbit');
  }, [session, isPending, isLeader, router]);

  useEffect(() => {
    if (session && isLeader) {
      fetchTemplates();
      fetchTeams();
      fetchChannels();
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

  const fetchChannels = async () => {
    try {
      // Pull both purposes — leaders may want to target either an assign_task
      // or a discussion channel for the bot reminder.
      const [d, a] = await Promise.all([
        fetch('/api/channels?purpose=discussion').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/channels?purpose=assign_task').then((r) => (r.ok ? r.json() : [])),
      ]);
      const merged: ChannelOption[] = [...d, ...a].map((c: any) => ({ id: c.id, name: c.name }));
      setChannels(merged);
    } catch {}
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setDescription('');
    setFrequency('weekly');
    setCategory('');
    setType('INDIVIDUAL');
    setChannelId('');
    setChecklist([]);
    setDeadlineTime('');
    setDeadlineDay('');
    setSelectedTeamIds([]);
    setIsTeamWide(false);
    setError('');
    setShowForm(false);
  };

  const handleEdit = (t: Template) => {
    setEditId(t.id);
    setName(t.name);
    setDescription(t.description || '');
    setFrequency(t.frequency);
    setCategory(t.category || '');
    // Fall back to legacy isTeamWide → TEAM when the row predates the `type`
    // column (it'll be undefined on rows from before this migration).
    setType(t.type ?? ((t as any).isTeamWide ? 'TEAM' : 'INDIVIDUAL'));
    setChannelId((t as any).channelId || '');
    setChecklist((t.checklistItems || []).map((it) => ({ id: it.id, title: it.title })));
    setDeadlineTime((t as any).deadlineTime || '');
    setDeadlineDay((t as any).deadlineDay?.toString() || '');
    setSelectedTeamIds(Array.isArray((t as any).teamIds) && (t as any).teamIds.length > 0 ? (t as any).teamIds : (t.team?.id ? [t.team.id] : []));
    setIsTeamWide(!!(t as any).isTeamWide);
    setShowForm(true);
  };

  const updateChecklistTitle = (idx: number, title: string) => {
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, title } : it)));
  };
  const removeChecklistItem = (idx: number) => {
    setChecklist((prev) => prev.filter((_, i) => i !== idx));
  };
  const addChecklistItem = () => {
    setChecklist((prev) => [...prev, { title: '' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const cleanedChecklist = checklist
      .map((it) => ({ title: it.title.trim() }))
      .filter((it) => it.title.length > 0);

    if (type === 'TEAM' && cleanedChecklist.length === 0) {
      setError('Team-type templates need at least one checklist item — these are what members claim.');
      setSaving(false);
      return;
    }

    try {
      const url = editId ? `/api/orbit/templates/${editId}` : '/api/orbit/templates';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          frequency,
          category,
          type,
          channelId: channelId || null,
          deadlineTime,
          deadlineDay,
          teamIds: selectedTeamIds,
          isTeamWide,
          checklistItems: cleanedChecklist,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }

      resetForm();
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally { setSaving(false); }
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
      {/* Header */}
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
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700">{editId ? 'Edit Template' : 'New Template'}</h2>
            <button onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm mb-4">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-600">Task Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="e.g. Update sales report"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="e.g. Reporting, Operations"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                placeholder="Describe the routine task..."
              />
            </div>

            {/* Task Type — drives the claim UX on the spawned card:
                INDIVIDUAL = single-owner claim locks the whole task,
                TEAM       = per-checklist-item claims, auto-complete on 100%. */}
            <div>
              <label className="text-sm font-medium text-slate-600">Task Type *</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setType('INDIVIDUAL')}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                    type === 'INDIVIDUAL'
                      ? 'border-indigo-500 bg-indigo-50/60'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                  )}
                >
                  <UserIcon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', type === 'INDIVIDUAL' ? 'text-indigo-600' : 'text-slate-400')} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Individual</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">One person claims the task and owns it start-to-finish. Card locks to them.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('TEAM')}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                    type === 'TEAM'
                      ? 'border-indigo-500 bg-indigo-50/60'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                  )}
                >
                  <Users className={cn('w-5 h-5 mt-0.5 flex-shrink-0', type === 'TEAM' ? 'text-indigo-600' : 'text-slate-400')} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Team</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Members claim individual checklist items. Auto-completes when every item is done.</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Channel target — where the bot posts the generated card.
                Optional: leave empty if the template should only appear on /orbit. */}
            <div>
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Post Reminder To Channel
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              >
                <option value="">No channel — /orbit only</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>

            {/* Checklist editor — optional for INDIVIDUAL (personal tracking),
                mandatory for TEAM (these are the claimable items). */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-600">
                  Checklist Items {type === 'TEAM' ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}
                </label>
                <button
                  type="button"
                  onClick={addChecklistItem}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add item
                </button>
              </div>
              {type === 'TEAM' && (
                <p className="text-[11px] text-slate-400 mb-2">
                  Each item becomes a separately claimable task on the channel card (e.g. Brand X, Brand Y).
                </p>
              )}
              {checklist.length === 0 ? (
                <button
                  type="button"
                  onClick={addChecklistItem}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  + Add first item
                </button>
              ) : (
                <div className="space-y-1.5">
                  {checklist.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                      <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      <input
                        type="text"
                        value={it.title}
                        onChange={(e) => updateChecklistTitle(idx, e.target.value)}
                        placeholder={`Item ${idx + 1}`}
                        className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">Frequency *</label>
              <div className="flex gap-2 mt-1">
                {['weekly', 'monthly'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize',
                      frequency === f
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Deadline Settings */}
            <div className="grid grid-cols-2 gap-4">
              {(frequency === 'weekly' || frequency === 'monthly') && (
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    {frequency === 'weekly' ? 'Due Day of Week' : 'Due Day of Month'}
                  </label>
                  {frequency === 'weekly' ? (
                    <select
                      value={deadlineDay}
                      onChange={(e) => setDeadlineDay(e.target.value)}
                      className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    >
                      <option value="">Select day...</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="7">Sunday</option>
                    </select>
                  ) : (
                    <select
                      value={deadlineDay}
                      onChange={(e) => setDeadlineDay(e.target.value)}
                      className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    >
                      <option value="">Select date...</option>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-600">Due Time</label>
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Team Selector — Multi-select */}
            <div>
              <label className="text-sm font-medium text-slate-600">
                Visible to Team
              </label>
              <div className="mt-1.5 space-y-1.5">
                {selectedTeamIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedTeamIds.map(id => {
                      const team = teams.find(t => t.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200">
                          {team?.name || id}
                          <button type="button" onClick={() => setSelectedTeamIds(selectedTeamIds.filter(tid => tid !== id))}
                            className="text-indigo-400 hover:text-indigo-600 ml-0.5">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !selectedTeamIds.includes(e.target.value)) {
                      setSelectedTeamIds([...selectedTeamIds, e.target.value]);
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                >
                  <option value="">+ Add team...</option>
                  {teams.filter(t => !selectedTeamIds.includes(t.id)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedTeamIds.length === 0 ? 'Visible to all teams. Add teams to restrict visibility.' : `Visible to ${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''}.`}
              </p>
            </div>

            {/* Team-wide Toggle */}
            <div
              className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none"
              onClick={() => setIsTeamWide(!isTeamWide)}
            >
              <div className={cn(
                'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                isTeamWide ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white'
              )}>
                {isTeamWide && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Team-wide task</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  When enabled, all members of the selected team(s) must individually complete this routine task. Each member can add comments and proof of work.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
            >
              {saving ? 'Saving...' : editId ? 'Update Template' : 'Create Template'}
            </button>
          </form>
        </div>
      )}

      {/* Templates List */}
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
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-slate-800">{t.name}</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize', FREQ_COLORS[t.frequency])}>
                    {t.frequency}
                  </span>
                  {t.category && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                      {t.category}
                    </span>
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
                        const team = teams.find(tm => tm.id === id);
                        return (
                          <span key={id} className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                            {team?.name || id.slice(0, 8)}
                          </span>
                        );
                      });
                    }
                    if (t.team) {
                      return (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
                          {t.team.name}
                        </span>
                      );
                    }
                    return (
                      <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                        All Teams
                      </span>
                    );
                  })()}
                </div>
                {t.description && (
                  <p className="text-xs text-slate-400 truncate">{t.description}</p>
                )}
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
                  onClick={() => handleEdit(t)}
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
    </div>
  );
}
