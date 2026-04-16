import { SESSION_COOKIE_NAME } from '@coms-portal/shared/constants/roles'

export function getSessionCookieValue(cookieHeader: string): string | undefined {
  const cookies = cookieHeader.split(';')

  for (const cookie of cookies) {
    const [rawName, ...valueParts] = cookie.trim().split('=')
    if (rawName === SESSION_COOKIE_NAME) {
      return valueParts.join('=') || undefined
    }
  }

  return undefined
}
