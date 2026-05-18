'use client';

import { useEffect, useMemo, useState } from 'react';
import { User as UserIcon, Users, Hash, GripVertical, Plus, Trash2, AtSign, BellOff, Megaphone, Search, Check, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TemplateType = 'INDIVIDUAL' | 'TEAM';

// 'none' (or null) = no mention prepended; 'channel' = broadcast everyone in
// the channel; any other string = the user id of a specific mention target.
export type MentionTargetMode = 'none' | 'channel' | 'user';

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
  mentionTarget?: string | null;
  referenceUrls?: string[];
  checklistItems?: { id: string; title: string; position: number }[];
  deadlineTime?: string | null;
  deadlineDay?: number | null;
  timezone?: string | null;
  // Legacy — kept on the interface so existing rows still hydrate cleanly,
  // but no longer surfaced in the form UI. type=TEAM replaces it.
  isTeamWide?: boolean;
  teamIds?: string[];
}

// Every routine template fires in Asia/Jakarta wall-clock. The team is
// SE-Asia-only and the per-template tz selector created more support load
// than it ever saved (creators picking UTC by accident, browser-tz hydration
// races on shared accounts). The picker is gone from the UI; this constant
// is the single source of truth the form submits on both create and edit.
// The scheduler still reads `template.timezone` so legacy rows with other
// IANA values keep firing in their stored zone until they're re-saved.
const ROUTINE_TIMEZONE = 'Asia/Jakarta';

interface ChannelOption { id: string; name: string }
interface UserOption { id: string; name: string; image?: string | null }

interface RoutineTemplateFormProps {
  initial?: RoutineTemplateFormInitial | null;
  channels: ChannelOption[];
  users: UserOption[];
  onSaved: () => void;
  onCancel?: () => void;
  /** Channel preselected when summoning the form from a specific channel (e.g. /remind). */
  defaultChannelId?: string;
}

export function RoutineTemplateForm({
  initial,
  channels,
  users,
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
  // Decompose the persisted `mentionTarget` string into (mode, userId) so the
  // UI can switch cleanly between modes while preserving the chosen user when
  // the creator toggles back and forth.
  const initialMode: MentionTargetMode =
    !initial?.mentionTarget ? 'none' : initial.mentionTarget === 'channel' ? 'channel' : 'user';
  const [mentionMode, setMentionMode] = useState<MentionTargetMode>(initialMode);
  const [mentionUserId, setMentionUserId] = useState<string>(
    initial?.mentionTarget && initial.mentionTarget !== 'channel' ? initial.mentionTarget : '',
  );
  const [mentionUserQuery, setMentionUserQuery] = useState('');
  const [checklist, setChecklist] = useState<RoutineTemplateFormChecklistItem[]>(
    (initial?.checklistItems ?? []).map((it) => ({ id: it.id, title: it.title })),
  );
  const [deadlineTime, setDeadlineTime] = useState(initial?.deadlineTime ?? '');
  const [deadlineDay, setDeadlineDay] = useState(initial?.deadlineDay?.toString() ?? '');
  const [referenceUrls, setReferenceUrls] = useState<string[]>(initial?.referenceUrls ?? []);
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingUrlError, setPendingUrlError] = useState('');

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

  const addReferenceUrl = () => {
    const raw = pendingUrl.trim();
    if (!raw) return;
    // Mild client-side gate so the chip list never holds garbage; the server
    // re-validates so this is just UX, not security.
    let normalized: string;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      normalized = u.toString();
    } catch {
      setPendingUrlError('Enter a valid http:// or https:// URL.');
      return;
    }
    if (referenceUrls.includes(normalized)) {
      setPendingUrlError('That link is already in the list.');
      return;
    }
    setReferenceUrls((prev) => [...prev, normalized]);
    setPendingUrl('');
    setPendingUrlError('');
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

    const cleaned = checklist
      .map((it) => ({ title: it.title.trim() }))
      .filter((it) => it.title.length > 0);

    if (type === 'TEAM' && cleaned.length === 0) {
      setError('Team-type templates need at least one checklist item — these are what members claim.');
      setSaving(false);
      return;
    }

    let mentionTarget: string | null = null;
    if (mentionMode === 'channel') mentionTarget = 'channel';
    else if (mentionMode === 'user') {
      if (!mentionUserId) {
        setError('Pick a user to mention, or switch the mention target to None / Everyone.');
        setSaving(false);
        return;
      }
      mentionTarget = mentionUserId;
    }

    try {
      const url = editId ? `/fast/api/orbit/templates/${editId}` : '/fast/api/orbit/templates';
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
          mentionTarget,
          referenceUrls,
          timezone: ROUTINE_TIMEZONE,
          deadlineTime,
          deadlineDay,
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

      {/* Reference Links — typically Google Sheets / Notion docs. Dynamic
          list: type a URL, click Add (or press Enter), it lands as a chip.
          x removes. The server-side normalizer dedupes + rejects non-http(s)
          so it's safe to be permissive here. */}
      <div>
        <label className="text-sm font-medium text-slate-600">Reference Links</label>
        <div className="mt-1 flex items-stretch gap-2">
          <input
            type="url"
            value={pendingUrl}
            onChange={(e) => { setPendingUrl(e.target.value); if (pendingUrlError) setPendingUrlError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addReferenceUrl();
              }
            }}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={addReferenceUrl}
            disabled={!pendingUrl.trim()}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
          >
            Add
          </button>
        </div>
        {pendingUrlError && (
          <p className="text-[11px] text-rose-600 mt-1">{pendingUrlError}</p>
        )}
        {referenceUrls.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {referenceUrls.map((url, idx) => {
              const host = (() => {
                try { return new URL(url).hostname.replace(/^www\./, ''); }
                catch { return url; }
              })();
              return (
                <div
                  key={`${url}-${idx}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 group"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate flex-1" title={url}>{host}</span>
                  <span className="text-[10px] text-slate-400 truncate hidden sm:block max-w-[280px]" title={url}>{url}</span>
                  <button
                    type="button"
                    onClick={() => setReferenceUrls((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Remove link"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 mt-1">
            Optional — each link becomes a clickable button on the bot's card.
          </p>
        )}
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

      {/* Who to mention — drives both the @-prefix the bot adds and the
          notification fan-out. Only meaningful when a channel target is set;
          otherwise the bot won't post anywhere so mentions are moot. */}
      <div>
        <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
          <AtSign className="w-3.5 h-3.5 text-slate-400" />
          Who to mention?
        </label>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <MentionModeButton
            active={mentionMode === 'none'}
            icon={BellOff}
            label="None"
            hint="Silent post"
            onClick={() => setMentionMode('none')}
          />
          <MentionModeButton
            active={mentionMode === 'channel'}
            icon={Megaphone}
            label="Everyone"
            hint="@channel"
            onClick={() => setMentionMode('channel')}
          />
          <MentionModeButton
            active={mentionMode === 'user'}
            icon={UserIcon}
            label="Specific user"
            hint={mentionUserId ? users.find((u) => u.id === mentionUserId)?.name ?? '1 selected' : 'Pick one'}
            onClick={() => setMentionMode('user')}
          />
        </div>
        {mentionMode === 'user' && (
          <UserPicker
            users={users}
            selectedId={mentionUserId}
            onSelect={setMentionUserId}
            query={mentionUserQuery}
            onQueryChange={setMentionUserQuery}
          />
        )}
        {mentionMode === 'channel' && !channelId && (
          <p className="text-[11px] text-amber-600 mt-1.5">
            Pick a channel above first — mentions only fire when the bot actually posts somewhere.
          </p>
        )}
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

function MentionModeButton({
  active,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-2 p-2.5 rounded-xl border-2 text-left transition-all',
        active ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
      )}
    >
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', active ? 'text-indigo-600' : 'text-slate-400')} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-tight">{label}</p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</p>}
      </div>
    </button>
  );
}

function UserPicker({
  users,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  users: UserOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? users.filter((u) => u.name.toLowerCase().includes(q))
      : users;
    // Surface the selected user even when it falls outside the current query
    // so toggling the filter doesn't visually orphan the current choice.
    if (selectedId && !base.some((u) => u.id === selectedId)) {
      const sel = users.find((u) => u.id === selectedId);
      if (sel) return [sel, ...base];
    }
    return base.slice(0, 50);
  }, [users, query, selectedId]);

  return (
    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search a teammate…"
          className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      <div className="max-h-[200px] overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400">No matches.</p>
        ) : (
          filtered.map((u) => {
            const active = u.id === selectedId;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelect(u.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700',
                )}
              >
                {u.image ? (
                  <img src={u.image} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="flex-1 truncate">{u.name}</span>
                {active && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
