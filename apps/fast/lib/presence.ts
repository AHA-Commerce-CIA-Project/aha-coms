export type PresenceLabel = 'Active' | 'Idle' | 'Offline';

export interface Presence {
  label: PresenceLabel;
  dot: string;
  color: string;
}

export function getPresence(lastSeenAt: string | null | undefined): Presence {
  if (!lastSeenAt) return { label: 'Offline', dot: 'bg-slate-300', color: 'text-slate-400' };
  const diffMin = (Date.now() - new Date(lastSeenAt).getTime()) / 60000;
  if (diffMin < 1) return { label: 'Active', dot: 'bg-emerald-400', color: 'text-emerald-500' };
  if (diffMin < 5) return { label: 'Idle', dot: 'bg-amber-400', color: 'text-amber-500' };
  return { label: 'Offline', dot: 'bg-slate-300', color: 'text-slate-400' };
}
