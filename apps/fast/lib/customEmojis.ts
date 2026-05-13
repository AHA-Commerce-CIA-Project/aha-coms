'use client';

import { useEffect, useState } from 'react';

// Workspace custom emoji record returned by /api/emojis/custom.
export interface CustomEmoji {
    id: string;
    name: string;        // shortcode without colons, e.g. "party-parrot"
    imageUrl: string;
    creatorId: string;
    creatorName?: string;
    createdAt: string;
}

// Module-level cache shared across the whole client session. Renderers and
// the picker read synchronously from here; the fetch + subscribe pair below
// keeps it warm and pushes change events when entries are added/removed.
let cache: CustomEmoji[] = [];
let cacheMap: Record<string, CustomEmoji> = {};
let inFlight: Promise<CustomEmoji[]> | null = null;
let lastFetched = 0;
const TTL_MS = 60 * 1000;

function rebuildMap() {
    const m: Record<string, CustomEmoji> = {};
    for (const e of cache) m[e.name] = e;
    cacheMap = m;
}

export function getCustomEmojiCache(): CustomEmoji[] {
    return cache;
}

export function getCustomEmojiMap(): Record<string, CustomEmoji> {
    return cacheMap;
}

export async function fetchCustomEmojis(force = false): Promise<CustomEmoji[]> {
    const now = Date.now();
    if (!force && now - lastFetched < TTL_MS) return cache;
    if (inFlight) return inFlight;
    inFlight = fetch('/api/emojis/custom')
        .then((r) => (r.ok ? r.json() : []))
        .then((list: CustomEmoji[]) => {
            cache = Array.isArray(list) ? list : [];
            lastFetched = Date.now();
            rebuildMap();
            inFlight = null;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('custom-emojis-change'));
            }
            return cache;
        })
        .catch(() => {
            inFlight = null;
            return cache;
        });
    return inFlight;
}

export function subscribeCustomEmojis(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('custom-emojis-change', listener);
    return () => window.removeEventListener('custom-emojis-change', listener);
}

// React hook — returns the current cache and re-renders the consumer when it changes.
// `fetchCustomEmojis()` is called on first mount; subsequent calls are deduped.
export function useCustomEmojis(): CustomEmoji[] {
    const [, setTick] = useState(0);
    useEffect(() => {
        fetchCustomEmojis();
        return subscribeCustomEmojis(() => setTick((t) => t + 1));
    }, []);
    return cache;
}

export function useCustomEmojiMap(): Record<string, CustomEmoji> {
    const [, setTick] = useState(0);
    useEffect(() => {
        fetchCustomEmojis();
        return subscribeCustomEmojis(() => setTick((t) => t + 1));
    }, []);
    return cacheMap;
}
