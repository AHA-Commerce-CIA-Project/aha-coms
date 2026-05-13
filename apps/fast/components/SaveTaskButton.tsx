'use client';

import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';

interface Props {
  taskId: string;
  className?: string;
}

export function SaveTaskButton({ taskId, className }: Props) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    fetch(`/fast/api/tasks/${taskId}/save`)
      .then((r) => (r.ok ? r.json() : { saved: false }))
      .then((d) => { if (!cancelled) setSaved(!!d.saved); })
      .catch(() => { if (!cancelled) setSaved(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    const optimistic = !saved;
    setSaved(optimistic);
    try {
      const res = await fetch(`/fast/api/tasks/${taskId}/save`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.action === 'saved');
      } else {
        setSaved(!optimistic);
      }
    } catch {
      setSaved(!optimistic);
    }
    setPending(false);
  };

  const filled = saved === true;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={filled ? 'Remove from Later' : 'Save for later'}
      className={
        className ||
        `p-1.5 rounded-lg transition-colors ${
          filled
            ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
            : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
        }`
      }
    >
      <Bookmark className={`w-4 h-4 ${filled ? 'fill-current' : ''}`} />
    </button>
  );
}
