'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Hash, Lock, Search, Check, Users as UsersIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  teamName: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface CreateChannelModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateChannelModal({ open, onClose, onCreated }: CreateChannelModalProps) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/chat/users')
      .then((res) => (res.ok ? res.json() : []))
      .then(setUsers)
      .catch(() => {});
    fetch('/api/teams')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Team[]) => {
        setTeams(data);
        // Default: preselect the creator's team if they have one
        const myTeamId = profile?.teamId;
        if (myTeamId && data.some((t) => t.id === myTeamId)) {
          setSelectedTeamIds([myTeamId]);
        }
      })
      .catch(() => {});
  }, [open, profile]);

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

  if (!open) return null;

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          isPrivate,
          memberIds: isPrivate ? selectedMembers : [],
          allowedTeamIds: selectedTeamIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create channel');
      }

      setName('');
      setDescription('');
      setIsPrivate(false);
      setSelectedMembers([]);
      setSelectedTeamIds([]);
      setUserSearch('');
      onCreated();
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
            {isPrivate ? (
              <Lock className="w-5 h-5 text-indigo-600" />
            ) : (
              <Hash className="w-5 h-5 text-indigo-600" />
            )}
            <h2 className="text-lg font-bold text-slate-800">Create Channel</h2>
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

            {/* Private toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Private Channel</p>
                  <p className="text-xs text-slate-400">Only selected members can access</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPrivate(!isPrivate);
                  if (isPrivate) setSelectedMembers([]);
                }}
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
              <div ref={teamDropdownRef} className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <UsersIcon className="w-4 h-4 text-slate-500" />
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

                {/* Collapsed button */}
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

                {/* Expanded dropdown */}
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

          {/* Member picker (only when private) */}
          {isPrivate && (
            <div className="mt-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">
                  Add Members
                  {selectedMembers.length > 0 && (
                    <span className="ml-2 text-xs text-indigo-600 font-normal">
                      {selectedMembers.length} / {users.length} selected
                    </span>
                  )}
                </label>
              </div>

              {/* Selected member chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2 max-h-[60px] overflow-y-auto">
                  {selectedMembers.map((id) => {
                    const user = users.find((u) => u.id === id);
                    if (!user) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                      >
                        {user.name}
                        <button
                          type="button"
                          onClick={() => toggleMember(id)}
                          className="text-indigo-400 hover:text-indigo-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Search */}
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>

              {/* Select All */}
              <button
                type="button"
                onClick={() => {
                  const allIds = filteredUsers.map((u) => u.id);
                  const allSelected = allIds.every((id) => selectedMembers.includes(id));
                  if (allSelected) {
                    setSelectedMembers((prev) => prev.filter((id) => !allIds.includes(id)));
                  } else {
                    setSelectedMembers((prev) => [...new Set([...prev, ...allIds])]);
                  }
                }}
                className="flex items-center gap-3 px-3 py-2 mb-1 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    filteredUsers.length > 0 && filteredUsers.every((u) => selectedMembers.includes(u.id))
                      ? 'bg-indigo-600 border-indigo-600'
                      : filteredUsers.some((u) => selectedMembers.includes(u.id))
                        ? 'bg-indigo-200 border-indigo-400'
                        : 'border-slate-300'
                  )}
                >
                  {filteredUsers.length > 0 && filteredUsers.every((u) => selectedMembers.includes(u.id)) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                  {filteredUsers.some((u) => selectedMembers.includes(u.id)) &&
                    !filteredUsers.every((u) => selectedMembers.includes(u.id)) && (
                      <div className="w-2.5 h-0.5 bg-white rounded-full" />
                    )}
                </div>
                <span className="text-sm font-medium text-slate-600">Select All</span>
              </button>

              {/* User list */}
              <div className="overflow-y-auto max-h-[180px] border border-slate-200 rounded-xl">
                {filteredUsers.length === 0 ? (
                  <p className="text-center py-4 text-sm text-slate-400">No users found</p>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedMembers.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleMember(user.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border-b border-slate-100 last:border-b-0',
                          isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        )}
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold">
                          {user.image ? (
                            <img
                              src={user.image}
                              alt={user.name}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            user.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-700 truncate">
                              {user.name}
                            </span>
                            {(user.role === 'leader' || user.role === 'admin') && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                                {user.role === 'admin' ? 'master' : user.role}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                        <div
                          className={cn(
                            'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600'
                              : 'border-slate-300'
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

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
            disabled={loading || !name.trim() || (isPrivate && selectedMembers.length === 0)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating…
              </>
            ) : (
              `Create ${isPrivate ? 'Private ' : ''}Channel`
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
