import { renderEmail, type Rendered } from './render'

export interface OtpEmailArgs {
  code: string
  ttlMinutes: number
}

export function renderOtpEmail({ code, ttlMinutes }: OtpEmailArgs): Rendered & { subject: string } {
  const { textContent, htmlContent } = renderEmail({
    title: 'Your COMS portal sign-in code',
    bodyParagraphs: [
      `Use this code to finish signing in. It expires in ${ttlMinutes} minutes.`,
    ],
    codeBlock: code,
    footer: 'If you did not request this, you can ignore this email.',
  })
  return { subject: 'Your COMS portal sign-in code', textContent, htmlContent }
}
