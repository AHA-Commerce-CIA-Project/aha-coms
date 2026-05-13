// Seed the AHABOT system user. Idempotent — re-running is a no-op if the bot
// already exists. The bot row exists so the routine-reminder scheduler can
// author channel messages and own Tasks via real FKs, without giving the bot
// a way to sign in (no Account/Session rows, non-real email).
//
// Run:
//   DATABASE_URL='postgresql://...' node scripts/seed-system-bot.mjs
//
// Or via push-db's pattern (terraform.tfstate provides the URL):
//   node scripts/seed-system-bot.mjs

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const SYSTEM_BOT_ID = 'system-bot-ahabot';
const SYSTEM_BOT_NAME = 'AHABOT';
const SYSTEM_BOT_EMAIL = 'ahabot@system.local';

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const state = JSON.parse(fs.readFileSync('./terraform/terraform.tfstate', 'utf8'));
    const pass = state.outputs.database_password.value;
    const urlBase = state.outputs.database_connection_url.value;
    return urlBase.replace(':' + pass + '@', ':' + encodeURIComponent(pass) + '@');
  } catch {
    return null;
  }
}

async function main() {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error('No DATABASE_URL in env and no terraform.tfstate to fall back to. Aborting.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const existing = await prisma.user.findUnique({ where: { id: SYSTEM_BOT_ID } });
    if (existing) {
      console.log(`AHABOT already seeded — id=${existing.id} email=${existing.email}`);
      return;
    }
    const now = new Date();
    const bot = await prisma.user.create({
      data: {
        id: SYSTEM_BOT_ID,
        name: SYSTEM_BOT_NAME,
        email: SYSTEM_BOT_EMAIL,
        emailVerified: true,
        role: 'member',
        accountStatus: 'active',
        status: 'offline',
        createdAt: now,
        updatedAt: now,
      },
    });
    console.log(`AHABOT seeded — id=${bot.id} email=${bot.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
