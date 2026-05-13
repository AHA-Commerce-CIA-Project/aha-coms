// Tracks per-user emoji usage in localStorage so the picker can surface a
// "Frequently Used" row at the top, Slack-style. We score by count + recency
// so emojis the user picked five times last quarter don't outrank the ones
// they're actually using this week.
//
// Storage shape: { [token]: { count: number; lastUsed: number } }
// `token` is whatever the picker hands us — a unicode char like "🎉" or a
// custom-emoji shortcode like ":party-parrot:". Both live in the same store
// so the row mixes them naturally.

const KEY = 'emoji-frequents-v1';
const MAX_ENTRIES = 200; // hard cap so the store never balloons
const RECENCY_WEIGHT_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type Entry = { count: number; lastUsed: number };

function read(): Record<string, Entry> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function write(map: Record<string, Entry>) {
    if (typeof window === 'undefined') return;
    try {
        // Trim to the top MAX_ENTRIES by lastUsed so old entries don't accumulate forever.
        const entries = Object.entries(map);
        if (entries.length > MAX_ENTRIES) {
            entries.sort((a, b) => b[1].lastUsed - a[1].lastUsed);
            const trimmed: Record<string, Entry> = {};
            for (const [k, v] of entries.slice(0, MAX_ENTRIES)) trimmed[k] = v;
            map = trimmed;
        }
        window.localStorage.setItem(KEY, JSON.stringify(map));
        window.dispatchEvent(new Event('emoji-frequents-change'));
    } catch {}
}

export function bumpEmojiFrequent(token: string) {
    if (!token) return;
    const map = read();
    const prev = map[token];
    map[token] = {
        count: (prev?.count || 0) + 1,
        lastUsed: Date.now(),
    };
    write(map);
}

// Returns top N tokens, ranked by count + a recency boost. The boost decays
// linearly over RECENCY_WEIGHT_MS so a recently-used emoji can leapfrog an
// older one with slightly more uses, matching the "what I'm reaching for
// today" feel of Slack's frequents row.
export function getEmojiFrequents(limit = 15): string[] {
    const map = read();
    const now = Date.now();
    const ranked = Object.entries(map)
        .map(([token, entry]) => {
            const ageMs = now - entry.lastUsed;
            const recencyBoost = Math.max(0, 1 - ageMs / RECENCY_WEIGHT_MS);
            return { token, score: entry.count + recencyBoost * 3, lastUsed: entry.lastUsed };
        })
        .sort((a, b) => b.score - a.score || b.lastUsed - a.lastUsed)
        .slice(0, limit)
        .map((r) => r.token);
    return ranked;
}

// Subscribe to changes (useful if multiple pickers are mounted). Returns an
// unsubscribe function.
export function subscribeEmojiFrequents(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('emoji-frequents-change', listener);
    window.addEventListener('storage', listener);
    return () => {
        window.removeEventListener('emoji-frequents-change', listener);
        window.removeEventListener('storage', listener);
    };
}
