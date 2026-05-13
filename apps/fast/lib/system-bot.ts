// System Bot identity — the "AHABOT" user that authors automated messages
// posted by the routine-reminder scheduler. The User row is a normal record
// (Prisma FKs reference it like any other author), it just has a well-known
// id + a non-real email so it can't sign in via Better Auth. Auth flows
// require a Session/Account; the bot has neither.
//
// To use from server code:
//   const bot = await getOrCreateSystemBot();
//   await prisma.channelMessage.create({ data: { senderId: bot.id, ... } });

import { prisma } from '@/lib/db';

export const SYSTEM_BOT_ID = 'system-bot-ahabot';
export const SYSTEM_BOT_NAME = 'AHABOT';
export const SYSTEM_BOT_EMAIL = 'ahabot@system.local';

/** True if the given user id is the system bot. Cheap; safe to call in render. */
export function isSystemBot(userId: string | null | undefined): boolean {
  return userId === SYSTEM_BOT_ID;
}

/**
 * Idempotent — looks up the bot by its well-known id and creates it on miss.
 * Safe to call before every bot-authored write (cheap when the row exists).
 * Throws on DB failure; the caller decides whether to swallow.
 */
export async function getOrCreateSystemBot() {
  const existing = await prisma.user.findUnique({ where: { id: SYSTEM_BOT_ID } });
  if (existing) return existing;

  const now = new Date();
  return prisma.user.create({
    data: {
      id: SYSTEM_BOT_ID,
      name: SYSTEM_BOT_NAME,
      email: SYSTEM_BOT_EMAIL,
      role: 'member',
      // accountStatus=active so audit/lookup queries don't filter the bot
      // out; the bot has no portal_sub and never resolves via
      // loadFastAuthUser — it exists purely as the author-of-record for
      // system-emitted messages and audit log lines.
      accountStatus: 'active',
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    },
  });
}
