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

// FU-12: the bot's canonical portal identity (identity_users.id) — seeded by
// portal-api migration 0037_system_bot_identity.sql. Pre-T64 the bot's Fast
// User.id is still SYSTEM_BOT_ID (synthetic, BetterAuth-era). During T64's
// destructive `User.id → portal_sub` rewrite this UUID is the value the bot's
// User row gets re-keyed to, alongside every human user's id getting re-keyed
// to their own portal_sub. Keep this constant in lockstep with the migration.
export const SYSTEM_BOT_PORTAL_SUB = 'b07b07b0-0000-4000-a000-000000000bb7';

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
