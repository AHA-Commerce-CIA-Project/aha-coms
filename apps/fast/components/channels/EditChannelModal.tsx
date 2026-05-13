'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Hash, Lock, Search, Check, Users as UsersIcon, ChevronDown, Pencil, Globe, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Team {
  id: string;
  name: string;
}

interface EditChannelModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  channel: {
    id: string;
    name: string;
    description: string | null;
    isPrivate?: boolean;
    allowedTeamIds?: string[];
    visibleToAllTeams?: boolean;
    purpose?: 'discussion' | 'assign_task';
    teamId?: string | null;
  } | null;
}

export function EditChannelModal({ open, onClose, onUpdated, channel }: EditChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [visibleToAllTeams, setVisibleToAllTeams] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const [ownerTeamId, setOwnerTeamId] = useState<string>('');
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAssignTask = channel?.purpose === 'assign_task';

  // Populate form when modal opens with a channel
  useEffect(() => {
    if (!open || !channel) return;
    setName(channel.name);
    setDescription(channel.description || '');
    setIsPrivate(!!channel.isPrivate);
    setSelectedTeamIds(channel.allowedTeamIds || []);
    setVisibleToAllTeams(!!channel.visibleToAllTeams);
    setOwnerTeamId(channel.teamId || '');
    setError(null);
    setTeamSearch('');
    setOwnerSearch('');
    setTeamDropdownOpen(false);
    setOwnerDropdownOpen(false);
  }, [open, channel]);

  // Fetch teams list
  useEffect(() => {
    if (!open) return;
    fetch('/fast/api/teams')
      .then((res) => (res.ok ? res.json() : []))
      .then(setTeams)
      .catch(() => {});
  }, [open]);

  // Close team dropdown on outside click
  useEffect(() => {
    if (!teamDropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(e.target as Node)) {
        setTeamDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [teamDropdownOpen]);

  useEffect(() => {
    if (!ownerDropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target as Node)) {
        setOwnerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [ownerDropdownOpen]);

  if (!open || !channel) return null;

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAssignTask && !ownerTeamId) {
      setError('Please pick the owning team for this Assign Task channel.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/fast/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          isPrivate,
          allowedTeamIds: visibleToAllTeams ? [] : selectedTeamIds,
          visibleToAllTeams: !isPrivate && visibleToAllTeams,
          ...(isAssignTask ? { teamId: ownerTeamId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update channel');
      }

      const updated = await res.json();
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Edit Channel</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Channel Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. general, announcements"
                required
                maxLength={100}
                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this channel about?"
                className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            {/* Owning team — only for Assign Task channels */}
            {isAssignTask && (
              <div ref={ownerDropdownRef} className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-medium text-slate-700">
                    Owning team <span className="text-rose-500">*</span>
                  </label>
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  Tasks posted in this channel are routed to this team&rsquo;s Inbox.
                </p>
                <button
                  type="button"
                  onClick={() => setOwnerDropdownOpen((v) => !v)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border rounded-xl text-sm text-slate-800 hover:border-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors',
                    ownerTeamId ? 'border-slate-200' : 'border-rose-200',
                  )}
                >
                  <span className="truncate text-left">
                    {ownerTeamId
                      ? teams.find((t) => t.id === ownerTeamId)?.name || 'Unknown team'
                      : <span className="text-slate-400">Select a team…</span>}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', ownerDropdownOpen && 'rotate-180')} />
                </button>

                {ownerDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={ownerSearch}
                          onChange={(e) => setOwnerSearch(e.target.value)}
                          placeholder="Search teams…"
                          autoFocus
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {teams.length === 0 ? (
                        <p className="text-center py-4 text-sm text-slate-400 italic">Loading teams…</p>
                      ) : (
                        (() => {
                          const filtered = teams.filter((t) =>
                            t.name.toLowerCase().includes(ownerSearch.toLowerCase())
                          );
                          if (filtered.length === 0) {
                            return <p className="text-center py-4 text-sm text-slate-400">No teams match &ldquo;{ownerSearch}&rdquo;</p>;
                          }
                          return filtered.map((t) => {
                            const isSelected = ownerTeamId === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setOwnerTeamId(t.id);
                                  setOwnerDropdownOpen(false);
                                  setOwnerSearch('');
                                }}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border-b border-slate-50 last:border-b-0',
                                  isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                )}
                              >
                                <div
                                  className={cn(
                                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                                  )}
                                >
                                  {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <span className="text-sm text-slate-700">{t.name}</span>
                              </button>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Private toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                {isPrivate ? (
                  <Lock className="w-4 h-4 text-slate-500" />
                ) : (
                  <Hash className="w-4 h-4 text-slate-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700">Private Channel</p>
                  <p className="text-xs text-slate-400">Only explicit members can access</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  isPrivate ? 'bg-indigo-600' : 'bg-slate-200'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    isPrivate ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Team visibility — only for public channels */}
            {!isPrivate && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-medium text-slate-700">Channel visibility</label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibleToAllTeams(true)}
                    className={cn(
                      'flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors',
                      visibleToAllTeams
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <Globe className={cn('w-4 h-4 mt-0.5 flex-shrink-0', visibleToAllTeams ? 'text-indigo-600' : 'text-slate-400')} />
                    <div>
                      <p className={cn('text-sm font-medium', visibleToAllTeams ? 'text-indigo-700' : 'text-slate-700')}>All teams</p>
                      <p className="text-xs text-slate-400 mt-0.5">Everyone in the org can see this channel</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleToAllTeams(false)}
                    className={cn(
                      'flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-colors',
                      !visibleToAllTeams
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <UsersIcon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', !visibleToAllTeams ? 'text-indigo-600' : 'text-slate-400')} />
                    <div>
                      <p className={cn('text-sm font-medium', !visibleToAllTeams ? 'text-indigo-700' : 'text-slate-700')}>Selected teams</p>
                      <p className="text-xs text-slate-400 mt-0.5">Only picked teams can see this channel</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Team picker — only when "Selected teams" is chosen */}
            {!isPrivate && !visibleToAllTeams && (
              <div ref={teamDropdownRef} className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium text-slate-700">
                    Visible to teams
                    {selectedTeamIds.length > 0 && (
                      <span className="ml-2 text-xs text-indigo-600 font-normal">
                        {selectedTeamIds.length} selected
                      </span>
                    )}
                  </label>
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  Pick one or more teams that can see this channel. Members of other teams won&rsquo;t see it in their Channels list.
                </p>

                <button
                  type="button"
                  onClick={() => setTeamDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 hover:border-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                >
                  <span className="truncate text-left">
                    {selectedTeamIds.length === 0
                      ? <span className="text-slate-400">Select teams…</span>
                      : selectedTeamIds
                          .map((id) => teams.find((t) => t.id === id)?.name)
                          .filter(Boolean)
                          .join(', ')}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', teamDropdownOpen && 'rotate-180')} />
                </button>

                {teamDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                          placeholder="Search teams…"
                          autoFocus
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="max-h-[220px] overflow-y-auto">
                      {teams.length === 0 ? (
                        <p className="text-center py-4 text-sm text-slate-400 italic">Loading teams…</p>
                      ) : (
                        (() => {
                          const filtered = teams.filter((t) =>
                            t.name.toLowerCase().includes(teamSearch.toLowerCase())
                          );
                          if (filtered.length === 0) {
                            return <p className="text-center py-4 text-sm text-slate-400">No teams match &ldquo;{teamSearch}&rdquo;</p>;
                          }
                          return filtered.map((t) => {
                            const isSelected = selectedTeamIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTeam(t.id)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border-b border-slate-50 last:border-b-0',
                                  isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                )}
                              >
                                <div
                                  className={cn(
                                    'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                                  )}
                                >
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-sm text-slate-700">{t.name}</span>
                              </button>
                            );
                          });
                        })()
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim() || (isAssignTask && !ownerTeamId)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
