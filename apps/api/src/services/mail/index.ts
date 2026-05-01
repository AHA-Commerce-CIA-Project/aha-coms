import { logger } from '~/logger'
// @getbrevo/brevo is lazy-imported only when MAIL_TRANSPORT=brevo

export interface SendMailArgs {
  to: string
  subject: string
  textContent: string
  htmlContent?: string
}

export type MailTransport = 'stdout' | 'brevo' | 'memory'

// __memoryInbox is exported for tests; real code MUST NOT read it.
export const __memoryInbox: SendMailArgs[] = []
export function __clearMemoryInbox(): void {
  __memoryInbox.length = 0
}

function getTransport(): MailTransport {
  const t = (process.env.MAIL_TRANSPORT ?? 'stdout') as MailTransport
  if (t !== 'stdout' && t !== 'brevo' && t !== 'memory') {
    throw new Error(`[mail] invalid MAIL_TRANSPORT='${t}', expected stdout|brevo|memory`)
  }
  // Hard-fail in production if stdout is set — Cloud Run logs would leak OTP codes.
  if (t === 'stdout' && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[mail] MAIL_TRANSPORT=stdout is forbidden in production (would leak OTP codes to logs)',
    )
  }
  return t
}

// Validate at module load so misconfig fails the boot, not the first send.
const TRANSPORT = getTransport()

export async function sendMail(args: SendMailArgs): Promise<void> {
  if (TRANSPORT === 'memory') {
    __memoryInbox.push({ ...args })
    return
  }
  if (TRANSPORT === 'stdout') {
    logger.info(
      { to: args.to, subject: args.subject, textContent: args.textContent },
      '[mail] (stdout) send',
    )
    return
  }
  // brevo
  await sendViaBrevo(args)
}

async function sendViaBrevo(args: SendMailArgs): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  const fromEmail = process.env.BREVO_FROM
  if (!apiKey || !fromEmail) {
    throw new Error('[mail] brevo transport requires BREVO_API_KEY and BREVO_FROM env vars')
  }
  // Lazy import so dev/test paths don't load Brevo SDK
  const Brevo = await import('@getbrevo/brevo')
  const api = new Brevo.TransactionalEmailsApi()
  api.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey)
  const replyTo = process.env.BREVO_REPLY_TO
  try {
    await api.sendTransacEmail({
      to: [{ email: args.to }],
      sender: { email: fromEmail, name: 'COMS Portal' },
      subject: args.subject,
      textContent: args.textContent,
      ...(args.htmlContent ? { htmlContent: args.htmlContent } : {}),
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    })
  } catch (err) {
    logger.error({ err, to: args.to, subject: args.subject }, '[mail] Brevo send failed')
    throw err
  }
}
