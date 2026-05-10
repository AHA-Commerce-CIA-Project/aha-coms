'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Paperclip, Image as ImageIcon, Send, X, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Code, ClipboardList } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { MentionAutocomplete, type MentionAutocompleteHandle, type MentionTeam, type MentionTarget } from './MentionAutocomplete';
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
  teams?: MentionTeam[];
  onTypingUsersChange?: (users: TypingUser[]) => void;
  // Slash-command hook. When provided, typing `/req` then Tab enters
  // "Task Request" draft mode; the next Enter calls this with the text +
  // attachments instead of sending a chat message. Parents that don't pass
  // this (e.g. DM pane) keep plain chat behavior.
  onTaskCommand?: (description: string, attachments: Attachment[]) => void;
}

export function ChannelMessageComposer({
  channelId,
  channelName,
  onSend,
  disabled,
  placeholder,
  users,
  teams = [],
  onTypingUsersChange,
  onTaskCommand,
}: ChannelMessageComposerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
  const [isTaskDraftMode, setIsTaskDraftMode] = useState(false);
  const [showTaskHint, setShowTaskHint] = useState(false);
  const lastTypingSent = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mentionRef = useRef<MentionAutocompleteHandle>(null);

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

  // Per-channel draft persistence (Slack-style): preserve typed content per
  // channel so switching away keeps the draft, and returning restores it.
  // We *remove* the draft from storage when loading so the active channel
  // never shows up in the "has draft" indicator — the in-memory editor owns
  // it until the user switches away again.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    let draft = '';
    if (channelId) {
      try {
        draft = localStorage.getItem(`composer-draft:${channelId}`) || '';
        if (draft) {
          localStorage.removeItem(`composer-draft:${channelId}`);
          window.dispatchEvent(new Event('composer-draft-change'));
        }
      } catch {}
    }
    editor.innerHTML = draft;
    setShowToolbar(false);
    setIsTaskDraftMode(false);
    setShowTaskHint(false);

    return () => {
      if (!channelId) return;
      const html = editor.innerHTML;
      const text = editor.textContent || '';
      const key = `composer-draft:${channelId}`;
      try {
        if (text.trim()) localStorage.setItem(key, html);
        else localStorage.removeItem(key);
        window.dispatchEvent(new Event('composer-draft-change'));
      } catch {}
    };
  }, [channelId]);

  // Persist draft on tab close / page hide so refreshes don't lose it.
  useEffect(() => {
    if (!channelId) return;
    const persist = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const html = editor.innerHTML;
      const text = editor.textContent || '';
      const key = `composer-draft:${channelId}`;
      try {
        if (text.trim()) localStorage.setItem(key, html);
        else localStorage.removeItem(key);
        window.dispatchEvent(new Event('composer-draft-change'));
      } catch {}
    };
    window.addEventListener('beforeunload', persist);
    window.addEventListener('pagehide', persist);
    return () => {
      window.removeEventListener('beforeunload', persist);
      window.removeEventListener('pagehide', persist);
    };
  }, [channelId]);

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

  // List commands (insertOrderedList / insertUnorderedList) operate on the
  // current block element. Shift+Enter inserts a soft <br> WITHIN that block,
  // so the line "above" the caret is part of the same block — clicking the
  // list button after a Shift+Enter makes the WHOLE block (including the
  // pre-break content) the list item, instead of just the new line.
  //
  // Fix: before invoking the list command, split the current block on every
  // <br> so each soft-broken line becomes its own block. The browser's list
  // command then turns just the caret-line block into the new list item.
  const splitSoftBreaksAtCaret = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    // Walk up to the nearest block ancestor. If we hit an LI we're already
    // inside a list — leave the toggle to execCommand. If nothing matches,
    // treat the editor itself as the block.
    let block: HTMLElement | null = null;
    let n: Node | null = range.startContainer;
    while (n && n !== editor) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as HTMLElement).tagName;
        if (tag === 'LI') return;
        if (tag === 'DIV' || tag === 'P') { block = n as HTMLElement; break; }
      }
      n = n.parentNode;
    }
    if (!block) block = editor;

    if (!/<br\b[^>]*>/i.test(block.innerHTML)) return;

    // Anchor the caret with a marker we can re-find after rewriting innerHTML.
    const marker = document.createElement('span');
    marker.setAttribute('data-caret-marker', '1');
    range.insertNode(marker);

    const parts = block.innerHTML.split(/<br\b[^>]*>/i);
    block.innerHTML = parts.map(p => `<div>${p && p.trim().length > 0 ? p : '<br>'}</div>`).join('');

    const restored = block.querySelector('span[data-caret-marker="1"]');
    if (restored) {
      const newRange = document.createRange();
      newRange.setStartBefore(restored);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      restored.remove();
    }
  };

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
      splitSoftBreaksAtCaret();
    }
    document.execCommand(command, false, value);
    updateActiveFormats();
  };

  // Slack-style list behavior: when the caret is inside an <li>, a soft-line-
  // break key (Shift+Enter, since plain Enter sends in this composer) should
  // create the NEXT list item — not a <br> inside the current item. On an
  // empty <li>, the same key exits the list and drops the caret into a fresh
  // block below it (so a stray Shift+Enter "ends" the list naturally).
  // Returns true if we handled the keystroke; the caller should preventDefault.
  const tryListAwareSoftBreak = (): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return false;

    let li: HTMLElement | null = null;
    let n: Node | null = range.startContainer;
    while (n && n !== editor) {
      if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'LI') {
        li = n as HTMLElement;
        break;
      }
      n = n.parentNode;
    }
    if (!li) return false;

    const isEmpty = !(li.textContent || '').trim();
    if (isEmpty) {
      // Exit the list: remove the empty <li>, drop a new <div><br></div> after
      // the parent list, and put the caret there. If that empties the list,
      // remove the list too.
      const list = li.parentElement;
      if (!list || !list.parentNode) return false;
      const newBlock = document.createElement('div');
      newBlock.appendChild(document.createElement('br'));
      list.parentNode.insertBefore(newBlock, list.nextSibling);
      li.remove();
      if (list.children.length === 0) list.remove();
      const r = document.createRange();
      r.setStart(newBlock, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      // Non-empty <li>: split at caret. Content before stays in the current
      // <li>, content after (or a fresh <br> if caret was at the end) becomes
      // the next <li>.
      const newLi = document.createElement('li');
      // Move trailing content (after the caret) into the new <li>.
      const tail = range.cloneRange();
      tail.setEndAfter(li);
      const tailContent = tail.extractContents();
      // tailContent may include a wrapping <li> (everything after caret within
      // the current li, plus the original <li>'s closing — depends on spec).
      // In practice extractContents starting from a position inside <li> and
      // ending after the same <li> returns the <li> closing tag's content.
      // Append whatever came out into newLi; if empty, give it a <br> so the
      // caret has somewhere to land.
      while (tailContent.firstChild) {
        const child = tailContent.firstChild;
        // If the extracted content includes the original <li> wrapper, unwrap it.
        if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'LI') {
          while (child.firstChild) newLi.appendChild(child.firstChild);
          (child as Element).remove();
        } else {
          newLi.appendChild(child);
        }
      }
      if (!newLi.firstChild) newLi.appendChild(document.createElement('br'));
      li.parentNode!.insertBefore(newLi, li.nextSibling);
      const r = document.createRange();
      r.setStart(newLi, 0);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    updateActiveFormats();
    return true;
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

  const enterTaskMode = useCallback(() => {
    if (editorRef.current) editorRef.current.innerHTML = '';
    setShowTaskHint(false);
    setIsTaskDraftMode(true);
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const submitTaskCommand = () => {
    if (!onTaskCommand) return;
    const text = getEditorText();
    if (!text.trim() && attachments.length === 0) return;
    onTaskCommand(text, attachments);
    if (editorRef.current) editorRef.current.innerHTML = '';
    setAttachments([]);
    setIsTaskDraftMode(false);
    setShowTaskHint(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // When the mention popup is open, intercept navigation/selection keys
    // before they trigger send or tab-out.
    if (showMention && mentionRef.current?.hasItems()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionRef.current.moveDown(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionRef.current.moveUp(); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        mentionRef.current.selectActive();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowMention(false); return; }
    }
    // Slash-command: text exactly `/req` + Tab → enter Task Request draft mode.
    if (e.key === 'Tab' && !isTaskDraftMode && onTaskCommand) {
      if (getEditorText().trim() === '/req') {
        e.preventDefault();
        enterTaskMode();
        return;
      }
    }
    // Backspace on an empty editor cancels task draft mode.
    if (e.key === 'Backspace' && isTaskDraftMode && isEditorEmpty() && attachments.length === 0) {
      e.preventDefault();
      setIsTaskDraftMode(false);
      return;
    }
    // Enter while in task mode opens the Direct Assign modal with the typed
    // description instead of sending a chat message.
    if (e.key === 'Enter' && !e.shiftKey && isTaskDraftMode) {
      e.preventDefault();
      submitTaskCommand();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Shift+Enter inside a list: continue the list (or exit on empty).
    // Outside a list: fall through to the browser default which inserts a <br>.
    if (e.key === 'Enter' && e.shiftKey) {
      if (tryListAwareSoftBreak()) {
        e.preventDefault();
        return;
      }
    }
    // Keyboard shortcuts for formatting
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') { e.preventDefault(); execFormat('bold'); }
      if (e.key === 'i') { e.preventDefault(); execFormat('italic'); }
      if (e.key === 'u') { e.preventDefault(); execFormat('underline'); }
    }

    // Markdown shortcuts: typing "1." / "1" / "1)" / "-" / "*" at the start of
    // a line followed by Space converts the line into a list. Skip when already
    // inside a list so existing items don't get double-wrapped.
    //
    // We bypass document.execCommand entirely here and build the list element
    // by hand. Chrome's execCommand merges adjacent empty blocks with the
    // previous one's content (the "line above" gets sucked into the new list
    // item) and silently no-ops when the caret block is empty — both broke
    // this shortcut on soft-broken lines (Shift+Enter then "1.").
    if (e.key === ' ' && editorRef.current) {
      try {
        const inOl = document.queryCommandState('insertOrderedList');
        const inUl = document.queryCommandState('insertUnorderedList');
        if (inOl || inUl) return;
      } catch {}

      // First, split soft breaks so the current line is isolated in its own
      // block. After this the prefix-only line is the entire content of the
      // caret's block — easy to detect and easy to replace.
      splitSoftBreaksAtCaret();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!editorRef.current.contains(range.startContainer)) return;

      // Find the closest block-level ancestor — that's the "line" we'll replace.
      let block: HTMLElement | null = null;
      let nb: Node | null = range.startContainer;
      while (nb && nb !== editorRef.current) {
        if (nb.nodeType === Node.ELEMENT_NODE) {
          const tg = (nb as HTMLElement).tagName;
          if (tg === 'DIV' || tg === 'P') { block = nb as HTMLElement; break; }
        }
        nb = nb.parentNode;
      }

      const beforeRange = document.createRange();
      beforeRange.setStart(block || editorRef.current, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const before = beforeRange.toString();

      let listTag: 'ol' | 'ul' | null = null;
      if (before === '1.' || before === '1' || before === '1)') listTag = 'ol';
      else if (before === '-' || before === '*') listTag = 'ul';
      if (!listTag) return;

      e.preventDefault();

      // Build the list element. The empty <li> with a <br> placeholder gives
      // the caret somewhere to land that contenteditable will accept input
      // into.
      const list = document.createElement(listTag);
      const li = document.createElement('li');
      li.appendChild(document.createElement('br'));
      list.appendChild(li);

      if (block) {
        // Common case after splitSoftBreaksAtCaret: the caret block contains
        // exactly the typed prefix. Swap the whole block out for the list.
        block.parentNode?.replaceChild(list, block);
      } else {
        // No DIV/P wrapper — the editor itself is the block. Delete the
        // prefix first, then drop the list at the caret.
        beforeRange.deleteContents();
        const r = sel.rangeCount > 0 ? sel.getRangeAt(0) : range;
        r.insertNode(list);
      }

      // Place the caret inside the new <li> so the next keystroke types into it.
      const newRange = document.createRange();
      newRange.setStart(li, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      updateActiveFormats();
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

    // A sent message shouldn't linger as a draft when the user returns.
    if (channelId) {
      try {
        localStorage.removeItem(`composer-draft:${channelId}`);
        window.dispatchEvent(new Event('composer-draft-change'));
      } catch {}
    }
  };

  const handleInput = () => {
    const text = getEditorText();
    if (text.trim()) emitTyping();

    // Slash-command hint: show a clickable Tab pill while the editor reads `/req`.
    const shouldShowTaskHint = !isTaskDraftMode && text.trim() === '/req' && !!onTaskCommand;
    if (shouldShowTaskHint !== showTaskHint) setShowTaskHint(shouldShowTaskHint);

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

  const handleMentionSelect = (target: MentionTarget) => {
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

    // Build label by mention type.
    let mentionLabel: string;
    if (target === 'all') mentionLabel = '@all';
    else if (typeof target === 'object' && 'kind' in target && target.kind === 'team') mentionLabel = '@' + target.team.mentionHandle;
    else mentionLabel = '@' + (target as MentionUser).name.replace(/\s+/g, '.');

    // Split the text node: before @, then chip, then space + rest
    const before = text.substring(0, atIdx);
    const after = text.substring(range.startOffset);

    const parent = textNode.parentNode;
    if (!parent) return;

    const beforeNode = document.createTextNode(before);
    const chip = document.createElement('span');
    chip.setAttribute('contenteditable', 'false');
    if (target === 'all') {
        chip.className = 'mention-chip text-indigo-600 font-semibold bg-indigo-50 px-1 rounded';
        chip.setAttribute('data-mention', 'all');
    } else if (typeof target === 'object' && 'kind' in target && target.kind === 'team') {
        chip.className = 'mention-chip text-emerald-700 font-semibold bg-emerald-50 px-1 rounded';
        chip.setAttribute('data-team-id', target.team.id);
        chip.setAttribute('data-team-handle', target.team.mentionHandle);
    } else {
        chip.className = 'mention-chip text-indigo-600 font-semibold bg-indigo-50 px-1 rounded';
        chip.setAttribute('data-user-id', (target as MentionUser).id);
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
    // flex-shrink-0 protects the composer from being pushed below the
    // viewport when the message feed contains long content. Without this,
    // an unbounded feed in a tight flex column can clip the composer.
    <div className="border-t border-slate-200 bg-white px-4 py-3 flex-shrink-0">
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

        {/* Task draft mode badge — replaces the chat-message intent. */}
        {isTaskDraftMode && (
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold">
              <ClipboardList className="w-3 h-3" />
              Task Request
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setIsTaskDraftMode(false); }}
                className="ml-0.5 p-0.5 rounded hover:bg-indigo-200 hover:text-indigo-900"
                title="Cancel (or press Backspace on an empty input)"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
            <span className="text-[11px] text-slate-400">Press Enter ↵ to open the task form</span>
          </div>
        )}

        {/* Editor area */}
        <div className="relative">
          {/* Slash-command hint — appears when editor reads exactly `/req`. */}
          {showTaskHint && !isTaskDraftMode && onTaskCommand && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); enterTaskMode(); }}
              className="absolute bottom-full left-3 mb-2 z-10 inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-md hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
            >
              <ClipboardList className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span className="flex flex-col items-start text-left">
                <span className="text-xs font-semibold text-slate-700 leading-tight">Task Request</span>
                <span className="text-[10px] text-slate-400 leading-tight">Open the Direct Assign form</span>
              </span>
              <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">Tab ↹</span>
            </button>
          )}
          <MentionAutocomplete
            ref={mentionRef}
            users={users}
            teams={teams}
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
            data-placeholder={isTaskDraftMode ? 'Describe the task you need done…' : (placeholder || `Message #${channelName}`)}
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
            onClick={() => (isTaskDraftMode ? submitTaskCommand() : handleSend())}
            disabled={(isEditorEmpty() && attachments.length === 0) || uploading || disabled}
            className="flex-shrink-0 p-2 sm:p-1.5 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
            title={isTaskDraftMode ? 'Open the task form' : 'Send'}
          >
            {isTaskDraftMode ? <ClipboardList className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {uploading && (
        <p className="text-xs text-indigo-500 mt-1 font-medium">Uploading...</p>
      )}

      <ImageLightbox
        src={lightboxUrl}
        images={attachments.filter((a: any) => a.isImage).map((a: any) => a.url)}
        onClose={() => setLightboxUrl(null)}
      />
    </div>
  );
}
