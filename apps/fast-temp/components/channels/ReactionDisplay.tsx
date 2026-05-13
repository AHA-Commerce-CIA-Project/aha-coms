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
    <div className="flex flex-wrap gap-1.5 mt-2">
      {Object.values(grouped).map((group) => {
        const hasOwn = group.users.some((u) => u.id === currentUserId);
        return (
          <button
            key={group.emoji}
            onClick={() => onToggleReaction(group.emoji)}
            title={`${group.users.map((u) => u.name).join(', ')} reacted with ${group.emoji}`}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border-2 transition-all hover:scale-105',
              hasOwn
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
            )}
          >
            <span className="text-lg leading-none">{group.emoji}</span>
            <span className="font-bold text-sm">{group.users.length}</span>
          </button>
        );
      })}
      <button
        onClick={onOpenPicker}
        className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 hover:border-slate-300 transition-all text-sm"
        title="Add reaction"
      >
        +
      </button>
    </div>
  );
}
