'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { htmlToPlainText } from '@/lib/sanitize';

interface DeleteMessageModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  // What's being deleted — Slack-style preview card.
  preview: {
    senderName: string;
    senderImage: string | null;
    createdAt: string;
    content: string;
    channelName?: string;
    // Label for the small footer line ("Direct Message", "Channel", "Thread reply", etc.).
    contextLabel?: string;
  };
  // "message" or "reply" — affects the title/copy.
  kind?: 'message' | 'reply';
}

function formatSlackTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`;
}

export function DeleteMessageModal({ open, onClose, onConfirm, preview, kind = 'message' }: DeleteMessageModalProps) {
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  const title = kind === 'reply' ? 'Delete reply' : 'Delete message';
  const body = kind === 'reply'
    ? 'Are you sure you want to delete this reply? This cannot be undone.'
    : 'Are you sure you want to delete this message? This cannot be undone.';

  // Render the preview content as plain text — strip HTML tags so the modal stays simple.
  const previewText = preview.content ? htmlToPlainText(preview.content).trim() : '';
  const truncated = previewText.length > 240 ? previewText.slice(0, 240) + '…' : previewText;

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !deleting && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-5">
          <p className="text-sm text-slate-600 leading-relaxed">{body}</p>

          {/* Slack-style preview card */}
          <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-md bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                {preview.senderImage ? (
                  <img
                    src={preview.senderImage}
                    alt={preview.senderName}
                    className="w-9 h-9 rounded-md object-cover"
                  />
                ) : (
                  preview.senderName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-sm text-slate-900">{preview.senderName}</span>
                  <span className="text-xs text-slate-500">{formatSlackTimestamp(preview.createdAt)}</span>
                </div>
                {truncated ? (
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words line-clamp-4">
                    {truncated}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400 italic">(no text)</p>
                )}
                {(preview.contextLabel || preview.channelName) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {preview.contextLabel || (preview.channelName ? `#${preview.channelName}` : '')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
