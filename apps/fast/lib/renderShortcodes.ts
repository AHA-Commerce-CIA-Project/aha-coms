// Replaces `:shortcode:` tokens in message HTML with inline <img> tags from
// the workspace custom-emoji cache. Splits the input on tag boundaries and
// only walks text segments so HTML attributes (e.g. an href that happens to
// contain a colon-pair) are never rewritten.
//
// Token grammar matches the picker + API: `[a-z][a-z0-9_-]{1,31}`. Unknown
// shortcodes are left as plain text so a missing emoji never destroys the
// surrounding message.

interface MinimalEmoji {
    imageUrl: string;
}

const SHORTCODE_RE = /:([a-z][a-z0-9_-]{1,31}):/g;

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c] as string));
}

export function renderShortcodes(
    html: string | null | undefined,
    emojiMap: Record<string, MinimalEmoji>,
): string {
    if (!html) return html || '';
    if (!emojiMap || Object.keys(emojiMap).length === 0) return html;

    // Split on HTML tag boundaries: even-indexed parts are text, odd parts are tags.
    const parts = html.split(/(<[^>]+>)/);
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) continue; // skip tags
        if (!parts[i].includes(':')) continue; // fast path
        parts[i] = parts[i].replace(SHORTCODE_RE, (full, name) => {
            const e = emojiMap[name];
            if (!e) return full;
            const url = escapeHtml(e.imageUrl);
            const safeName = escapeHtml(name);
            // align-text-bottom keeps the emoji visually on the text baseline.
            // mx-0.5 mirrors the small horizontal breathing room Slack uses.
            return `<img src="${url}" alt=":${safeName}:" data-shortcode="${safeName}" class="inline-block w-5 h-5 align-text-bottom mx-0.5" />`;
        });
    }
    return parts.join('');
}
