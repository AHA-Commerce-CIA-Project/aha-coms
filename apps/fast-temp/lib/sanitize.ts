import sanitizeHtml from 'sanitize-html';

// Whitelist for user-submitted rich-text descriptions (requests, tasks).
// Keep tight: only basic formatting, no media, no event handlers, no styles.
export function sanitizeRichText(input: string | null | undefined): string {
    if (!input) return '';
    return sanitizeHtml(input, {
        allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li', 'br', 'p', 'div', 'span', 'code'],
        allowedAttributes: { span: ['class'], code: ['class'] },
        allowedSchemes: [],
        disallowedTagsMode: 'discard',
    });
}

// Google Calendar descriptions arrive as HTML (bold, links, line breaks).
// Allow a slightly wider tag set than rich-text notes, including links.
export function sanitizeMeetingDescription(input: string | null | undefined): string {
    if (!input) return '';
    return sanitizeHtml(input, {
        allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'a', 'ul', 'ol', 'li'],
        allowedAttributes: { a: ['href', 'target', 'rel'], span: ['class'] },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
        },
        disallowedTagsMode: 'discard',
    });
}

// Return true if the string looks like it contains HTML tags.
export function isHtml(str: string | null | undefined): boolean {
    if (!str) return false;
    return /<[a-z][\s\S]*>/i.test(str);
}

// Convert rich-text HTML to plain text for display contexts that can't render tags
// (channel message previews, task-forward quotes, etc.).
// Block tags become newlines; <br> becomes a newline; everything else is stripped.
export function htmlToPlainText(input: string | null | undefined): string {
    if (!input) return '';
    return input
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        // Strip any unclosed trailing tag fragment (e.g. a string truncated mid-tag
        // like `<span class="...font-semi`). Matches `<` + anything until end-of-string
        // that never hits a closing `>`.
        .replace(/<[^<>]*$/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
