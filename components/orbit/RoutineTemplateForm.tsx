'use client';

import { useEffect, useState } from 'react';
import { User as UserIcon, Users, Hash, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TemplateType = 'INDIVIDUAL' | 'TEAM';

export interface RoutineTemplateFormChecklistItem {
  id?: string;
  title: string;
}

export interface RoutineTemplateFormInitial {
  id?: string;
  name?: string;
  description?: string | null;
  frequency?: string;
  category?: string | null;
  type?: TemplateType;
  channelId?: string | null;
  checklistItems?: { id: string; title: string; position: number }[];
  deadlineTime?: string | null;
  deadlineDay?: number | null;
  teamIds?: string[];
  isTeamWide?: boolean;
}

interface TeamOption { id: string; name: string }
interface ChannelOption { id: string; name: string }

interface RoutineTemplateFormProps {
  initial?: RoutineTemplateFormInitial | null;
  teams: TeamOption[];
  channels: ChannelOption[];
  onSaved: () => void;
  onCancel?: () => void;
  /** Channel preselected when summoning the form from a specific channel (e.g. /remind). */
  defaultChannelId?: string;
}

export function RoutineTemplateForm({
  initial,
  teams,
  channels,
  onSaved,
  onCancel,
  defaultChannelId,
}: RoutineTemplateFormProps) {
  const editId = initial?.id ?? null;
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'weekly');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [type, setType] = useState<TemplateType>(
    initial?.type ?? (initial?.isTeamWide ? 'TEAM' : 'INDIVIDUAL'),
  );
  const [channelId, setChannelId] = useState<string>(
    initial?.channelId ?? defaultChannelId ?? '',
  );
  const [checklist, setChecklist] = useState<RoutineTemplateFormChecklistItem[]>(
    (initial?.checklistItems ?? []).map((it) => ({ id: it.id, title: it.title })),
  );
  const [deadlineTime, setDeadlineTime] = useState(initial?.deadlineTime ?? '');
  const [deadlineDay, setDeadlineDay] = useState(initial?.deadlineDay?.toString() ?? '');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(initial?.teamIds ?? []);
  const [isTeamWide, setIsTeamWide] = useState(!!initial?.isTeamWide);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When the form is summoned from a channel (defaultChannelId set) and the
  // form is fresh (no initial), pre-select that channel — but don't override
  // the user's manual choice once they've picked something else.
  useEffect(() => {
    if (!editId && defaultChannelId && !channelId) {
      setChannelId(defaultChannelId);
    }
  }, [defaultChannelId, editId, channelId]);

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

    const cleaned = checklist
      .map((it) => ({ title: it.title.trim() }))
      .filter((it) => it.title.length > 0);

    if (type === 'TEAM' && cleaned.length === 0) {
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
          checklistItems: cleaned,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save template');
      }

      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">{error}</div>
      )}

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
            value={category ?? ''}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            placeholder="e.g. Reporting, Operations"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Description</label>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
          placeholder="Describe the routine task..."
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Task Type *</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={() => setType('INDIVIDUAL')}
            className={cn(
              'flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
              type === 'INDIVIDUAL' ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
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
              type === 'TEAM' ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
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
          {['daily', 'weekly', 'monthly'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize',
                frequency === f
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

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
            value={deadlineTime ?? ''}
            onChange={(e) => setDeadlineTime(e.target.value)}
            className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600">Visible to Team</label>
        <div className="mt-1.5 space-y-1.5">
          {selectedTeamIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTeamIds.map((id) => {
                const team = teams.find((t) => t.id === id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200">
                    {team?.name || id}
                    <button
                      type="button"
                      onClick={() => setSelectedTeamIds(selectedTeamIds.filter((tid) => tid !== id))}
                      className="text-indigo-400 hover:text-indigo-600 ml-0.5"
                    >
                      ×
                    </button>
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
            {teams.filter((t) => !selectedTeamIds.includes(t.id)).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {selectedTeamIds.length === 0 ? 'Visible to all teams. Add teams to restrict visibility.' : `Visible to ${selectedTeamIds.length} team${selectedTeamIds.length > 1 ? 's' : ''}.`}
        </p>
      </div>

      <div
        className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none"
        onClick={() => setIsTeamWide(!isTeamWide)}
      >
        <div className={cn('mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors', isTeamWide ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white')}>
          {isTeamWide && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">Team-wide task (legacy)</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Older flag — kept for back-compat. Prefer the Team task type above; that handles checklist-level claiming.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
        >
          {saving ? 'Saving...' : editId ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}
