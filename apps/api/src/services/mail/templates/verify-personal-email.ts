import { renderEmail, type Rendered } from './render'

export interface VerifyPersonalEmailArgs {
  code: string
  ttlMinutes: number
}

export function renderVerifyPersonalEmail({
  code,
  ttlMinutes,
}: VerifyPersonalEmailArgs): Rendered & { subject: string } {
  const subject = 'Verify your personal email for COMS portal'
  const { textContent, htmlContent } = renderEmail({
    title: subject,
    bodyParagraphs: [
      `Use this code to confirm this address as your personal sign-in email. It expires in ${ttlMinutes} minutes.`,
      'After confirmation you can sign in to the portal using this email and a fresh code.',
    ],
    codeBlock: code,
    footer: 'If you did not request this, you can ignore this email.',
  })
  return { subject, textContent, htmlContent }
}
