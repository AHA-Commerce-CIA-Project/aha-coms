'use client';

import { useRef, useState } from 'react';
import { MentionAutocomplete, type MentionAutocompleteHandle } from './MentionAutocomplete';

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  autoFocus,
  rows = 2,
  className,
  disabled,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionRef = useRef<MentionAutocompleteHandle>(null);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const detectMention = () => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const before = el.value.substring(0, pos);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMention(true);
      setMentionQuery(m[1]);
    } else {
      setShowMention(false);
      setMentionQuery('');
    }
  };

  const insertMention = (target: MentionUser | 'all' | { kind: 'team'; team: { id: string; name: string; mentionHandle: string } }) => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.substring(0, pos);
    const after = el.value.substring(pos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx < 0) {
      setShowMention(false);
      return;
    }
    let label: string;
    if (target === 'all') label = '@all';
    else if (typeof target === 'object' && 'kind' in target && target.kind === 'team') label = '@' + target.team.mentionHandle;
    else label = '@' + (target as MentionUser).name.replace(/\s+/g, '.');
    const newValue = before.substring(0, atIdx) + label + ' ' + after;
    onChange(newValue);
    setShowMention(false);
    const newPos = atIdx + label.length + 1;
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.selectionStart = newPos;
      t.selectionEnd = newPos;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMention && mentionRef.current?.hasItems()) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionRef.current.moveDown();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionRef.current.moveUp();
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        mentionRef.current.selectActive();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMention(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative">
      <MentionAutocomplete
        ref={mentionRef}
        users={users}
        query={mentionQuery}
        onSelect={insertMention}
        visible={showMention}
        placement="below"
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // Defer to after the value has been written to the DOM so the cursor position is accurate.
          requestAnimationFrame(detectMention);
        }}
        onClick={detectMention}
        onKeyUp={detectMention}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={rows}
        className={className}
        disabled={disabled}
      />
    </div>
  );
}
