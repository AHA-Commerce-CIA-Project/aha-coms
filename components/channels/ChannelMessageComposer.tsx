'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Image as ImageIcon, Send, X } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { MentionAutocomplete } from './MentionAutocomplete';
import { Smile } from 'lucide-react';

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
}

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface ChannelMessageComposerProps {
  channelName: string;
  onSend: (content: string, attachments: Attachment[], mentions: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  users: MentionUser[];
}

export function ChannelMessageComposer({
  channelName,
  onSend,
  disabled,
  placeholder,
  users,
}: ChannelMessageComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  }, [content]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!content.trim() && attachments.length === 0) || uploading || disabled) return;

    // Extract mention user IDs from content
    const mentionIds: string[] = [];
    const mentionPattern = /@(\S+)/g;
    let match;
    while ((match = mentionPattern.exec(content)) !== null) {
      const mentionName = match[1];
      const user = users.find(
        (u) =>
          u.name.toLowerCase().replace(/\s+/g, '.') === mentionName.toLowerCase() ||
          u.name.toLowerCase() === mentionName.toLowerCase()
      );
      if (user && !mentionIds.includes(user.id)) {
        mentionIds.push(user.id);
      }
    }

    onSend(content, attachments, mentionIds);
    setContent('');
    setAttachments([]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    // Detect @ mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMention(true);
      setMentionQuery(atMatch[1]);
      setMentionStart(cursorPos - atMatch[0].length);
    } else {
      setShowMention(false);
      setMentionQuery('');
    }
  };

  const handleMentionSelect = (user: MentionUser) => {
    const mentionText = '@' + user.name.replace(/\s+/g, '.');
    const before = content.substring(0, mentionStart);
    const cursorPos = textareaRef.current?.selectionStart || content.length;
    const after = content.substring(cursorPos);
    setContent(before + mentionText + ' ' + after);
    setShowMention(false);
    textareaRef.current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      imageFiles.forEach((f) => dt.items.add(f));
      handleUpload(dt.files);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/chat/upload', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setAttachments((prev) => [...prev, data]);
        }
      }
    } catch {
      // Silently handle upload errors
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-slate-200 bg-white px-6 py-3">
      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="relative group flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              {att.isImage ? (
                <img src={att.url} alt={att.name} className="w-10 h-10 rounded object-cover" />
              ) : (
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="text-slate-600 max-w-[120px] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="ml-1 p-0.5 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="relative flex items-end gap-2">
        <div className="relative flex-1">
          <MentionAutocomplete
            users={users}
            query={mentionQuery}
            onSelect={handleMentionSelect}
            visible={showMention}
          />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder || `Message #${channelName}`}
            disabled={disabled || uploading}
            rows={1}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
          />
        </div>

        <div className="flex items-center gap-1 pb-0.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />

          <button
            onClick={() => {
              const ta = textareaRef.current;
              if (ta) {
                const pos = ta.selectionStart;
                const before = content.substring(0, pos);
                const after = content.substring(pos);
                setContent(before + '@' + after);
                setShowMention(true);
                setMentionQuery('');
                setMentionStart(pos);
                setTimeout(() => {
                  ta.focus();
                  ta.selectionStart = ta.selectionEnd = pos + 1;
                }, 0);
              }
            }}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
            title="Mention someone"
          >
            <span className="text-lg font-bold leading-none">@</span>
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
            title="Upload image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
            title="Upload file"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
              title="Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            <EmojiPicker
              open={showEmoji}
              position="above"
              onSelect={(emoji) => {
                setContent((prev) => prev + emoji);
                textareaRef.current?.focus();
              }}
              onClose={() => setShowEmoji(false)}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={(!content.trim() && attachments.length === 0) || uploading || disabled}
            className="p-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Send"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {uploading && (
        <p className="text-xs text-indigo-500 mt-1 font-medium">Uploading...</p>
      )}
    </div>
  );
}
