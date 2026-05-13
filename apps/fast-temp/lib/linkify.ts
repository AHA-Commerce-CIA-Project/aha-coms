// Escape `<` `>` `&` `"` `'` in plain text so it can be safely injected into
// HTML via dangerouslySetInnerHTML.
export function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Decode the HTML entities our own pipeline emits, so a string already
// containing `&nbsp;`, `&amp;`, etc. (from a rich-text editor or pasted HTML)
// isn't double-escaped by escapeHtml below. Order matters: decode `&amp;`
// last so `&amp;lt;` decodes to `&lt;` then `<` (intentional), not `<` then
// re-decoded.
function decodeKnownEntities(input: string): string {
    return input
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

// Linkify a plain-text string. Escapes HTML first so user-typed `<` is rendered
// literally, then wraps URLs in clickable <a> tags. Use this when source is
// plain text; use linkifyHtml when source is already HTML.
export function linkifyText(input: string | null | undefined): string {
    if (!input) return '';
    return linkifyHtml(escapeHtml(decodeKnownEntities(input)));
}

// Wrap plain http/https URLs in HTML with clickable <a> tags. Walks the input
// outside-in so URLs already inside an <a> tag are left untouched. Trailing
// sentence punctuation (.,;:!?) and unbalanced closing parens are kept outside
// the link so "see https://x.com." doesn't include the trailing dot.
export function linkifyHtml(input: string | null | undefined): string {
    if (!input) return '';

    const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
    let out = '';
    let i = 0;
    let inAnchor = false;

    while (i < input.length) {
        if (input[i] === '<') {
            const end = input.indexOf('>', i);
            if (end === -1) { out += input.slice(i); break; }
            const tag = input.slice(i, end + 1);
            if (/^<a\b/i.test(tag)) inAnchor = true;
            else if (/^<\/a\s*>/i.test(tag)) inAnchor = false;
            out += tag;
            i = end + 1;
        } else {
            const next = input.indexOf('<', i);
            const segment = input.slice(i, next === -1 ? input.length : next);
            if (inAnchor) {
                out += segment;
            } else {
                out += segment.replace(URL_RE, (m) => {
                    let url = m;
                    let trail = '';
                    while (/[.,;:!?'"]$/.test(url)) {
                        trail = url[url.length - 1] + trail;
                        url = url.slice(0, -1);
                    }
                    const opens = (url.match(/\(/g) || []).length;
                    const closes = (url.match(/\)/g) || []).length;
                    if (closes > opens) {
                        const diff = closes - opens;
                        trail = url.slice(-diff) + trail;
                        url = url.slice(0, -diff);
                    }
                    if (!url) return m;
                    const safeHref = url.replace(/"/g, '&quot;');
                    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-700 underline break-all">${url}</a>${trail}`;
                });
            }
            i = next === -1 ? input.length : next;
        }
    }
    return out;
}
