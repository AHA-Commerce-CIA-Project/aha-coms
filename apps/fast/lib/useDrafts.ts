'use client';

import { useEffect, useState } from 'react';

const DRAFT_PREFIX = 'composer-draft:';

function readDraftIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const value = localStorage.getItem(k) || '';
      // A non-empty draft is one whose stripped text isn't empty. We persist
      // raw HTML, so peek at it via a temp element to avoid false positives
      // from invisible markup like <br> or empty <div>.
      let text = '';
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = value;
        text = (tmp.textContent || '').trim();
      } catch {}
      if (text) ids.add(k.slice(DRAFT_PREFIX.length));
    }
  } catch {}
  return ids;
}

// Read which channel/DM IDs currently have a saved draft, and stay live as
// drafts are written or cleared by the composer.
export function useDrafts(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => readDraftIds());

  useEffect(() => {
    const refresh = () => setIds(readDraftIds());
    window.addEventListener('composer-draft-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('composer-draft-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return ids;
}
