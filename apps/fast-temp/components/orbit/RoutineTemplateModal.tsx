'use client';

import { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { RoutineTemplateForm, type RoutineTemplateFormInitial } from './RoutineTemplateForm';

interface ChannelOption { id: string; name: string }
interface UserOption { id: string; name: string; image?: string | null }

interface RoutineTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** Pre-selects the channel — used when summoning from /remind inside a specific channel. */
  defaultChannelId?: string;
  /** Optional pre-fill for edit mode. */
  initial?: RoutineTemplateFormInitial | null;
}

export function RoutineTemplateModal({
  open,
  onClose,
  onSaved,
  defaultChannelId,
  initial,
}: RoutineTemplateModalProps) {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch('/api/channels?purpose=discussion').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/channels?purpose=assign_task').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/users').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([d, a, u]) => {
        if (cancelled) return;
        setChannels([...(d as any[]), ...(a as any[])].map((x) => ({ id: x.id, name: x.name })));
        setUsers(
          (u as any[])
            .filter((x) => x && x.id && x.name)
            .map((x) => ({ id: x.id, name: x.name, image: x.image ?? null })),
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Escape-key close — only when the modal owns focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-8 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {initial?.id ? 'Edit Routine Template' : 'New Routine Template'}
              </h2>
              <p className="text-[11px] text-slate-400">
                The bot uses this template to post recurring reminders into a channel.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[calc(100vh-180px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <RoutineTemplateForm
              initial={initial ?? null}
              channels={channels}
              users={users}
              defaultChannelId={defaultChannelId}
              onCancel={onClose}
              onSaved={() => {
                onSaved?.();
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
