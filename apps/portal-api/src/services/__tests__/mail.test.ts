import { describe, expect, test, beforeEach } from 'bun:test'

// IMPORTANT: set MAIL_TRANSPORT BEFORE importing the module, since transport is captured at module load.
process.env.MAIL_TRANSPORT = 'memory'
delete process.env.NODE_ENV // ensure not 'production'

const { sendMail, __memoryInbox, __clearMemoryInbox } = await import('../mail')
const { renderEmail } = await import('../mail/templates/render')
const { renderOtpEmail } = await import('../mail/templates/otp')

describe('mail/index', () => {
  beforeEach(() => __clearMemoryInbox())

  test('memory transport pushes to __memoryInbox', async () => {
    await sendMail({ to: 'a@b.com', subject: 'Hi', textContent: 'body' })
    expect(__memoryInbox.length).toBe(1)
    expect(__memoryInbox[0].to).toBe('a@b.com')
    expect(__memoryInbox[0].subject).toBe('Hi')
    expect(__memoryInbox[0].textContent).toBe('body')
  })

  test('memory transport preserves htmlContent if provided', async () => {
    await sendMail({ to: 'a@b.com', subject: 'Hi', textContent: 't', htmlContent: '<p>h</p>' })
    expect(__memoryInbox[0].htmlContent).toBe('<p>h</p>')
  })

  test('memory transport defensively copies args (caller mutation is safe)', async () => {
    const args = { to: 'a@b.com', subject: 'Hi', textContent: 'body' }
    await sendMail(args)
    args.subject = 'mutated'
    expect(__memoryInbox[0].subject).toBe('Hi')
  })
})

describe('mail/templates/render', () => {
  test('produces both text and html with the title and paragraphs', () => {
    const { textContent, htmlContent } = renderEmail({
      title: 'Hello',
      bodyParagraphs: ['First line.', 'Second line.'],
    })
    expect(textContent).toContain('Hello')
    expect(textContent).toContain('First line.')
    expect(textContent).toContain('Second line.')
    expect(htmlContent).toContain('Hello')
    expect(htmlContent).toContain('First line.')
    expect(htmlContent).toContain('Second line.')
  })

  test('escapes HTML entities in user-controlled content', () => {
    const { htmlContent } = renderEmail({
      title: '<script>',
      bodyParagraphs: ['Hello & world'],
    })
    expect(htmlContent).not.toContain('<script>')
    expect(htmlContent).toContain('&lt;script&gt;')
    expect(htmlContent).toContain('Hello &amp; world')
  })

  test('renders code block when provided', () => {
    const { textContent, htmlContent } = renderEmail({
      title: 'Code',
      bodyParagraphs: ['Code:'],
      codeBlock: '123456',
    })
    expect(textContent).toContain('123456')
    expect(htmlContent).toContain('123456')
  })
})

describe('mail/templates/otp', () => {
  test('renderOtpEmail produces subject + text + html with code and TTL', () => {
    const out = renderOtpEmail({ code: '654321', ttlMinutes: 10 })
    expect(out.subject).toBe('Your COMS portal sign-in code')
    expect(out.textContent).toContain('654321')
    expect(out.textContent).toContain('10 minutes')
    expect(out.htmlContent).toContain('654321')
  })
})
