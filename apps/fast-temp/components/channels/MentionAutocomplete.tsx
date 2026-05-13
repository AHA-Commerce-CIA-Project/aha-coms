'use client';

import { Users, Hash } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface MentionTeam {
  id: string;
  name: string;
  mentionHandle: string; // e.g. 'tfbi' (without leading @)
}

export type MentionTarget = MentionUser | 'all' | { kind: 'team'; team: MentionTeam };

interface MentionAutocompleteProps {
  users: MentionUser[];
  teams?: MentionTeam[];
  query: string;
  onSelect: (target: MentionTarget) => void;
  visible: boolean;
  placement?: 'above' | 'below';
}

export interface MentionAutocompleteHandle {
  moveUp: () => void;
  moveDown: () => void;
  selectActive: () => boolean;
  hasItems: () => boolean;
}

type Item =
  | { type: 'all' }
  | { type: 'user'; user: MentionUser }
  | { type: 'team'; team: MentionTeam };

export const MentionAutocomplete = forwardRef<MentionAutocompleteHandle, MentionAutocompleteProps>(
  function MentionAutocomplete({ users, teams = [], query, onSelect, visible, placement = 'above' }, ref) {
    const [activeIndex, setActiveIndex] = useState(0);

    const items = useMemo<Item[]>(() => {
      const q = query.toLowerCase();
      const filteredUsers = users
        .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
        .slice(0, 6);
      const filteredTeams = teams
        .filter((t) =>
          t.mentionHandle.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
        )
        .slice(0, 5);
      const showEveryone = !q || 'all'.startsWith(q) || 'everyone'.startsWith(q) || 'channel'.startsWith(q);
      const list: Item[] = [];
      if (showEveryone) list.push({ type: 'all' });
      // Teams first — using a team handle is usually a more deliberate ping than picking a user.
      for (const t of filteredTeams) list.push({ type: 'team', team: t });
      for (const u of filteredUsers) list.push({ type: 'user', user: u });
      return list;
    }, [users, teams, query]);

    // Reset selection to the top whenever the candidate list changes.
    useEffect(() => {
      setActiveIndex(0);
    }, [query, items.length]);

    useImperativeHandle(
      ref,
      () => ({
        moveUp: () => setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length)),
        moveDown: () => setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length)),
        selectActive: () => {
          if (items.length === 0) return false;
          const idx = Math.min(activeIndex, items.length - 1);
          const item = items[idx];
          if (item.type === 'all') onSelect('all');
          else if (item.type === 'team') onSelect({ kind: 'team', team: item.team });
          else onSelect(item.user);
          return true;
        },
        hasItems: () => items.length > 0,
      }),
      [items, activeIndex, onSelect],
    );

    if (!visible || items.length === 0) return null;

    const positionClass = placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1';

    return (
      <div className={`absolute ${positionClass} left-0 w-[280px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50`}>
        <div className="py-1 max-h-[280px] overflow-y-auto">
          {items.map((item, idx) => {
            const isActive = idx === activeIndex;
            if (item.type === 'all') {
              return (
                <button
                  key="__all__"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect('all');
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left border-b border-slate-100 ${
                    isActive ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 text-white">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">Everyone</div>
                    <div className="text-xs text-slate-400 truncate">Notify everyone in this channel</div>
                  </div>
                </button>
              );
            }
            if (item.type === 'team') {
              const team = item.team;
              return (
                <button
                  key={`team:${team.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect({ kind: 'team', team });
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${
                    isActive ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 text-white">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">@{team.mentionHandle}</div>
                    <div className="text-xs text-slate-400 truncate">{team.name} · notifies whole team</div>
                  </div>
                </button>
              );
            }
            const user = item.user;
            return (
              <button
                key={user.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(user);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left ${
                  isActive ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                  {user.image ? (
                    <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{user.name}</div>
                  <div className="text-xs text-slate-400 truncate">{user.email}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
