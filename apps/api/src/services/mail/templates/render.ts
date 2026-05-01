// Produces both text + minimal-HTML from a single definition.
// No external CSS, no images, no tracking pixels. Boring is reliable for transactional mail.

export interface RenderArgs {
  title: string
  bodyParagraphs: string[] // plain-text paragraphs
  codeBlock?: string // an emphasized 6-digit code or token, monospace big in HTML
  footer?: string // small print
}

export interface Rendered {
  textContent: string
  htmlContent: string
}

export function renderEmail(args: RenderArgs): Rendered {
  const { title, bodyParagraphs, codeBlock, footer } = args

  const text = [
    title,
    '',
    ...bodyParagraphs,
    ...(codeBlock ? ['', codeBlock, ''] : []),
    ...(footer ? ['', footer] : []),
  ].join('\n')

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const paragraphs = bodyParagraphs
    .map((p) => `<p style="margin:0 0 12px;">${escape(p)}</p>`)
    .join('')
  const codeHtml = codeBlock
    ? `<div style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:28px;letter-spacing:4px;font-weight:600;background:#f4f4f5;padding:16px 20px;border-radius:8px;text-align:center;margin:16px 0;">${escape(codeBlock)}</div>`
    : ''
  const footerHtml = footer
    ? `<p style="margin:24px 0 0;font-size:12px;color:#71717a;">${escape(footer)}</p>`
    : ''

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#18181b;background:#ffffff;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;">
    <h1 style="font-size:18px;margin:0 0 16px;font-weight:600;">${escape(title)}</h1>
    ${paragraphs}
    ${codeHtml}
    ${footerHtml}
  </div>
</body></html>`

  return { textContent: text, htmlContent: html }
}
