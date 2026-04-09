'use client';

import { cn } from '@/lib/utils';

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface MentionAutocompleteProps {
  users: MentionUser[];
  query: string;
  onSelect: (user: MentionUser) => void;
  visible: boolean;
}

export function MentionAutocomplete({ users, query, onSelect, visible }: MentionAutocompleteProps) {
  if (!visible || !query) return null;

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full mb-1 left-0 w-[280px] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
      <div className="py-1">
        {filtered.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelect(user)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 transition-colors text-left"
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
        ))}
      </div>
    </div>
  );
}
