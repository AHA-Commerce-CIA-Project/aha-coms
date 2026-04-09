'use client';

import { cn } from '@/lib/utils';

interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string };
}

interface ReactionDisplayProps {
  reactions: Reaction[];
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  onOpenPicker: () => void;
}

export function ReactionDisplay({
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenPicker,
}: ReactionDisplayProps) {
  if (reactions.length === 0) return null;

  // Group reactions by emoji
  const grouped = reactions.reduce<Record<string, { emoji: string; users: { id: string; name: string }[] }>>(
    (acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = { emoji: r.emoji, users: [] };
      }
      acc[r.emoji].users.push(r.user);
      return acc;
    },
    {}
  );

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {Object.values(grouped).map((group) => {
        const hasOwn = group.users.some((u) => u.id === currentUserId);
        return (
          <button
            key={group.emoji}
            onClick={() => onToggleReaction(group.emoji)}
            title={group.users.map((u) => u.name).join(', ')}
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
              hasOwn
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            )}
          >
            <span className="text-sm">{group.emoji}</span>
            <span className="font-medium">{group.users.length}</span>
          </button>
        );
      })}
      <button
        onClick={onOpenPicker}
        className="flex items-center justify-center w-7 h-7 rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors text-sm"
        title="Add reaction"
      >
        +
      </button>
    </div>
  );
}
