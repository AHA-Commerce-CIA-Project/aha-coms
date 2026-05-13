import { getPresence } from '@/lib/presence';
import { cn } from '@/lib/utils';

interface PresenceDotProps {
  lastSeenAt: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<PresenceDotProps['size']>, string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export function PresenceDot({ lastSeenAt, size = 'md', className }: PresenceDotProps) {
  const presence = getPresence(lastSeenAt);
  return (
    <span
      title={presence.label}
      className={cn(
        'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-slate-900',
        SIZE_MAP[size],
        presence.dot,
        className
      )}
    />
  );
}
