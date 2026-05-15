'use client';

import { useEffect, useState } from 'react';
import { X, Hash, Loader2, Eye } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
}

interface TeamMembersPopoverProps {
  open: boolean;
  teamId: string | null;
  channelId?: string | null;
  onClose: () => void;
  onMemberClick?: (userId: string) => void;
}

export function TeamMembersPopover({ open, teamId, channelId, onClose, onMemberClick }: TeamMembersPopoverProps) {
  const [team, setTeam] = useState<{ id: string; name: string; mentionHandle: string | null } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !teamId) return;
    setLoading(true);
    setTeam(null);
    setMembers([]);
    const url = channelId
      ? `/fast/api/teams/${teamId}/members?channelId=${encodeURIComponent(channelId)}`
      : `/fast/api/teams/${teamId}/members`;
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setTeam(data.team);
          setMembers(data.members || []);
        }
      })
      .finally(() => setLoading(false));
  }, [open, teamId, channelId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !teamId) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-white flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 text-white">
              <Hash className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{team?.name || 'Team'}</div>
              <div className="text-xs text-emerald-700 font-mono truncate">@{team?.mentionHandle || ''}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 px-4 text-slate-500 text-sm">
              <Eye className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
              No team members can access this channel.
            </div>
          ) : (
            <>
              <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {channelId ? 'Members with access · ' : 'Members · '}{members.length}
              </div>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onMemberClick?.(m.id)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                    {m.image ? (
                      <img src={m.image} alt={m.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      m.name?.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{m.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{m.email}</div>
                  </div>
                  {m.role !== 'member' && (
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${m.role === 'admin' ? 'text-purple-700' : 'text-indigo-700'}`}>
                      {m.role === 'admin' ? 'Master' : 'Leader'}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
