'use client';

import { useState, useEffect } from 'react';
import { Bookmark, Hash, X } from 'lucide-react';

interface SavedItem {
  id: string;
  createdAt: string;
  message: {
    id: string;
    content: string;
    attachments: any[];
    createdAt: string;
    sender: { id: string; name: string; image: string | null };
    channel: { id: string; name: string };
  };
}

interface SavedMessagesViewProps {
  onClose: () => void;
  onNavigate: (channelId: string, messageId: string) => void;
}

export function SavedMessagesView({ onClose, onNavigate }: SavedMessagesViewProps) {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const res = await fetch('/api/channels/saved');
        if (res.ok) {
          const data = await res.json();
          setSaved(data);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchSaved();
  }, []);

  const handleUnsave = async (messageId: string, channelId: string) => {
    await fetch(`/api/channels/${channelId}/${messageId}/save`, { method: 'POST' });
    setSaved((prev) => prev.filter((s) => s.message.id !== messageId));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-800">Saved Messages</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : saved.length === 0 ? (
          <div className="text-center py-12">
            <Bookmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No saved messages yet</p>
            <p className="text-xs text-slate-300 mt-1">
              Click the bookmark icon on any message to save it
            </p>
          </div>
        ) : (
          saved.map((item) => (
            <div
              key={item.id}
              className="px-6 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <button
                onClick={() => onNavigate(item.message.channel.id, item.message.id)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium mb-1 hover:underline"
              >
                <Hash className="w-3 h-3" />
                {item.message.channel.name}
              </button>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                  {item.message.sender.image ? (
                    <img
                      src={item.message.sender.image}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    item.message.sender.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-slate-700">
                      {item.message.sender.name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.message.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 mt-0.5">
                    {item.message.content || '[Attachment]'}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnsave(item.message.id, item.message.channel.id);
                  }}
                  className="p-1.5 text-amber-500 hover:text-rose-500 transition-colors self-start"
                  title="Unsave"
                >
                  <Bookmark className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
