'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Image as ImageIcon, Send, X, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Code } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { MentionAutocomplete } from './MentionAutocomplete';
import { Smile } from 'lucide-react';
import { ImageLightbox } from '@/components/ImageLightbox';

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

interface TypingUser {
  id: string;
  name: string;
}

interface ChannelMessageComposerProps {
  channelId?: string;
  channelName: string;
  onSend: (content: string, attachments: Attachment[], mentions: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  users: MentionUser[];
  onTypingUsersChange?: (users: TypingUser[]) => void;
}

export function ChannelMessageComposer({
  channelId,
  channelName,
  onSend,
  disabled,
  placeholder,
  users,
  onTypingUsersChange,
}: ChannelMessageComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const lastTypingSent = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Emit typing event (throttled to once per 2 seconds)
  const emitTyping = useCallback(() => {
    if (!channelId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    fetch(`/api/channels/${channelId}/typing`, { method: 'POST' }).catch(() => {});
  }, [channelId]);

  // Poll typing status
  useEffect(() => {
    if (!channelId) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/channels/${channelId}/typing`);
        if (res.ok && active) {
          const data = await res.json();
          onTypingUsersChange?.(data.typing || []);
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [channelId, onTypingUsersChange]);

  // Check active formatting at cursor
  const updateActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
    });
  }, []);

  useEffect(() => {
    const handler = () => updateActiveFormats();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [updateActiveFormats]);

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateActiveFormats();
  };

  const getEditorContent = () => {
    return editorRef.current?.innerHTML || '';
  };

  const getEditorText = () => {
    return editorRef.current?.textContent || '';
  };

  const isEditorEmpty = () => {
    const text = getEditorText().trim();
    return text === '' || text === '\n';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Keyboard shortcuts for formatting
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') { e.preventDefault(); execFormat('bold'); }
      if (e.key === 'i') { e.preventDefault(); execFormat('italic'); }
      if (e.key === 'u') { e.preventDefault(); execFormat('underline'); }
    }
  };

  const handleSend = () => {
    if ((isEditorEmpty() && attachments.length === 0) || uploading || disabled) return;

    const htmlContent = getEditorContent();

    // Extract mention user IDs from text content
    const textContent = getEditorText();
    const mentionIds: string[] = [];
    const mentionPattern = /@(\S+)/g;
    let match;
    let mentionsEveryone = false;
    while ((match = mentionPattern.exec(textContent)) !== null) {
      const mentionName = match[1].toLowerCase();
      if (mentionName === 'all' || mentionName === 'everyone' || mentionName === 'channel') {
        mentionsEveryone = true;
        continue;
      }
      const user = users.find(
        (u) =>
          u.name.toLowerCase().replace(/\s+/g, '.') === mentionName ||
          u.name.toLowerCase() === mentionName
      );
      if (user && !mentionIds.includes(user.id)) {
        mentionIds.push(user.id);
      }
    }
    if (mentionsEveryone) {
      for (const u of users) {
        if (!mentionIds.includes(u.id)) mentionIds.push(u.id);
      }
    }

    onSend(htmlContent, attachments, mentionIds);

    // Clear editor
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
    setAttachments([]);
    setShowToolbar(false);
  };

  const handleInput = () => {
    const text = getEditorText();
    if (text.trim()) emitTyping();

    // Detect @ mention
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editorRef.current!);
      preRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = preRange.toString();
      const atMatch = textBefore.match(/@(\w*)$/);
      if (atMatch) {
        setShowMention(true);
        setMentionQuery(atMatch[1]);
      } else {
        setShowMention(false);
        setMentionQuery('');
      }
    }
  };

  const handleMentionSelect = (user: MentionUser | 'all') => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) {
      setShowMention(false);
      return;
    }

    const text = textNode.textContent || '';
    const beforeCursor = text.substring(0, range.startOffset);
    const atIdx = beforeCursor.lastIndexOf('@');
    if (atIdx < 0) {
      setShowMention(false);
      return;
    }

    const mentionLabel = user === 'all' ? '@all' : '@' + user.name.replace(/\s+/g, '.');

    // Split the text node: before @, then chip, then space + rest
    const before = text.substring(0, atIdx);
    const after = text.substring(range.startOffset);

    const parent = textNode.parentNode;
    if (!parent) return;

    const beforeNode = document.createTextNode(before);
    const chip = document.createElement('span');
    chip.className = 'mention-chip text-indigo-600 font-semibold bg-indigo-50 px-1 rounded';
    chip.setAttribute('contenteditable', 'false');
    if (user !== 'all') {
        chip.setAttribute('data-user-id', user.id);
    } else {
        chip.setAttribute('data-mention', 'all');
    }
    chip.textContent = mentionLabel;
    const spaceNode = document.createTextNode('\u00A0' + after);

    parent.insertBefore(beforeNode, textNode);
    parent.insertBefore(chip, textNode);
    parent.insertBefore(spaceNode, textNode);
    parent.removeChild(textNode);

    // Position cursor right after the inserted non-breaking space
    const newRange = document.createRange();
    newRange.setStart(spaceNode, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setShowMention(false);
    editor.focus();
  };

  const insertEmoji = (emoji: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(emoji);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.textContent += emoji;
    }
  };

  const insertAtMention = () => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode('@');
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setShowMention(true);
    setMentionQuery('');
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
    } else {
      // Paste as plain text to avoid bringing in external styling
      const text = e.clipboardData.getData('text/plain');
      if (text) {
        e.preventDefault();
        document.execCommand('insertText', false, text);
      }
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

  const toolbarBtn = (command: string, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); execFormat(command); }}
      className={`p-1 rounded transition-colors ${
        activeFormats[command]
          ? 'text-indigo-600 bg-indigo-50'
          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
      }`}
      title={title}
    >
      {icon}
    </button>
  );

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      {/* Attachment preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="relative group flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              {att.isImage ? (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(att.url)}
                  className="rounded overflow-hidden hover:ring-2 hover:ring-indigo-300 transition-shadow"
                  title="Click to preview"
                >
                  <img src={att.url} alt={att.name} className="w-10 h-10 rounded object-cover cursor-zoom-in" />
                </button>
              ) : (
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="text-slate-600 max-w-[120px] truncate">{att.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="ml-1 p-0.5 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Rich text composer */}
      <div className="border border-slate-200 rounded-xl bg-slate-50 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors">
        {/* Formatting toolbar */}
        {showToolbar && (
          <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-200 bg-white rounded-t-xl">
            {toolbarBtn('bold', <Bold className="w-4 h-4" />, 'Bold (⌘B)')}
            {toolbarBtn('italic', <Italic className="w-4 h-4" />, 'Italic (⌘I)')}
            {toolbarBtn('underline', <Underline className="w-4 h-4" />, 'Underline (⌘U)')}
            {toolbarBtn('strikeThrough', <Strikethrough className="w-4 h-4" />, 'Strikethrough')}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            {toolbarBtn('insertOrderedList', <ListOrdered className="w-4 h-4" />, 'Numbered list')}
            {toolbarBtn('insertUnorderedList', <List className="w-4 h-4" />, 'Bullet list')}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  const range = sel.getRangeAt(0);
                  const code = document.createElement('code');
                  code.className = 'bg-slate-200 text-rose-600 px-1 rounded text-sm font-mono';
                  code.appendChild(range.extractContents());
                  range.insertNode(code);
                  range.setStartAfter(code);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Inline code"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Editor area */}
        <div className="relative">
          <MentionAutocomplete
            users={users}
            query={mentionQuery}
            onSelect={handleMentionSelect}
            visible={showMention}
          />
          <div
            ref={editorRef}
            contentEditable={!disabled && !uploading}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setShowToolbar(true)}
            data-placeholder={placeholder || `Message #${channelName}`}
            className="min-h-[40px] max-h-[160px] overflow-y-auto px-4 py-2.5 text-sm text-slate-800 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
          />
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200 bg-white rounded-b-xl">
          <div className="flex items-center gap-0.5">
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
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />

            {users.length > 0 && (
              <button
                type="button"
                onClick={insertAtMention}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                title="Mention someone"
              >
                <span className="text-sm font-bold leading-none">@</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
              title="Upload image"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
              title="Upload file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmoji(!showEmoji)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                title="Emoji"
              >
                <Smile className="w-4 h-4" />
              </button>
              <EmojiPicker
                open={showEmoji}
                position="above"
                onSelect={(emoji) => {
                  insertEmoji(emoji);
                  setShowEmoji(false);
                }}
                onClose={() => setShowEmoji(false)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={(isEditorEmpty() && attachments.length === 0) || uploading || disabled}
            className="p-1.5 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {uploading && (
        <p className="text-xs text-indigo-500 mt-1 font-medium">Uploading...</p>
      )}

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
