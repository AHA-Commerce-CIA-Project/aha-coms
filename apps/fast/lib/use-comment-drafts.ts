'use client';

import { useEffect, useState } from 'react';

const KEY_PREFIX = 'task-comment-draft:';
export const COMMENT_DRAFT_EVENT = 'task-comment-draft-changed';

function readDraftIds(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    const ids = new Set<string>();
    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith(KEY_PREFIX)) continue;
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                const hasText = typeof parsed?.text === 'string' && parsed.text.trim().length > 0;
                const hasAttachments = Array.isArray(parsed?.attachments) && parsed.attachments.length > 0;
                if (hasText || hasAttachments) {
                    ids.add(key.slice(KEY_PREFIX.length));
                }
            } catch {}
        }
    } catch {}
    return ids;
}

// Tracks the set of taskIds with a non-empty saved comment draft. Updates
// when storage changes in another tab (`storage` event) or when the same tab
// dispatches a `task-comment-draft-changed` window event after writing.
export function useCommentDraftTaskIds(): Set<string> {
    const [ids, setIds] = useState<Set<string>>(() => readDraftIds());

    useEffect(() => {
        const refresh = () => setIds(readDraftIds());
        // Same-tab updates from TaskCommentsSection.
        window.addEventListener(COMMENT_DRAFT_EVENT, refresh);
        // Cross-tab updates.
        const onStorage = (e: StorageEvent) => {
            if (!e.key || e.key.startsWith(KEY_PREFIX)) refresh();
        };
        window.addEventListener('storage', onStorage);
        // Initial sync (in case localStorage changed between SSR and mount).
        refresh();
        return () => {
            window.removeEventListener(COMMENT_DRAFT_EVENT, refresh);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return ids;
}
