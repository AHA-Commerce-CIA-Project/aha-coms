// Routine-reminder scheduler. Designed to be invoked on a cadence by Cloud
// Scheduler hitting POST /api/cron/routine-scheduler (or any cron that can
// hit an HTTP endpoint). Idempotent: runs that fire after a template has
// already spawned its Task for the current period are a no-op.
//
// Time handling — PR #62 audit:
//
//   Cloud Run's Node runtime reports UTC for both `new Date()` and every
//   raw Date getter (`getHours`, `getDay`, etc). Comparing the WIB-stored
//   `deadlineTime = "17:10"` against the server's native UTC clock would
//   silently mismatch — 17:10 WIB is 10:10 UTC, and a naïve check would
//   either fire seven hours early (treating 17:10 as UTC) or never fire
//   (since the UTC wall-clock never reads 17:10 during WIB business
//   hours). All wall-clock arithmetic in this file routes through
//   `date-fns-tz`'s `toZonedTime` / `fromZonedTime` so the math is
//   explicitly anchored to the template's IANA tz (defaults to
//   Asia/Jakarta).
//
// Rolling-window guarantee — the spawn check is:
//
//   spawn iff
//       now >= dueAt for the current period in the template's tz
//     AND no Task exists with routineTemplateId = template
//         AND createdAt >= periodStart
//
// That's a rolling window from `dueAt` through the end of the period, so
// a cron run delayed by minutes (cold start, retry, exact `* * * * *`
// tick that landed at 17:09:55 instead of 17:10:00, etc) still fires
// the template for the right period — and the period-dedup keeps it
// from double-posting if the cron runs multiple times after dueAt.
//
// Day-of-week mapping — for weekly templates the database stores
// `deadlineDay` as 1=Mon..7=Sun (ISO weekday). date-fns-tz's zoned
// Date reports JS-style 0=Sun..6=Sat via `getDay()`; the helper below
// remaps Sunday from 0 to 7 so the comparison against `deadlineDay`
// stays in the ISO space. The Tuesday@17:10 regression test in
// routine-scheduler.test.ts pins this mapping byte-for-byte.
//
// Observability: each invocation logs one summary line + per-template
// status. Look for `[routine-scheduler]` in Cloud Run logs to confirm
// the cron is firing on the expected cadence and to see why a given
// template was/wasn't spawned. The summary includes `runNowUtc` + the
// per-template `tz` projection so a timezone mismatch is debuggable
// from logs alone (no need to repro locally).

import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/db';
import { getOrCreateSystemBot } from '@/lib/system-bot';

type Frequency = 'daily' | 'weekly' | 'monthly';

// ---------- Timezone helpers (date-fns-tz backed) ----------

interface ZonedWallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 1-7 (Mon=1, Sun=7) — ISO convention to match DB `deadlineDay`
}

/**
 * Project a UTC instant into the wall-clock it represents in the given
 * IANA timezone. `toZonedTime` returns a Date whose calendar getters
 * (`getFullYear`, `getMonth`, …) already report the zoned values, so we
 * just read them off directly.
 *
 * The weekday remap is the critical bit: date-fns / native JS report
 * Sunday as 0, but `deadlineDay` is stored as 1..7 (Mon=1, Sun=7). The
 * `=== 0 ? 7 : jsDow` branch keeps the comparison space consistent —
 * `wallClockInTz(tuesday-utc, 'Asia/Jakarta').weekday === 2` regardless
 * of where on Earth the server happens to be.
 */
export function wallClockInTz(at: Date, tz: string): ZonedWallClock {
  const zoned = toZonedTime(at, tz);
  const jsDow = zoned.getDay(); // 0=Sun .. 6=Sat
  const isoWeekday = jsDow === 0 ? 7 : jsDow;
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1, // JS months are 0-based; we store 1-based
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    weekday: isoWeekday,
  };
}

/**
 * Inverse of `wallClockInTz`: given a wall-clock interpreted IN `tz`,
 * return the matching UTC instant.
 *
 * We construct a Date whose UTC getters return the requested calendar
 * fields (via `Date.UTC(...)`); `fromZonedTime` then interprets those
 * fields as wall-clock IN `tz` and returns the corresponding UTC
 * Date. Because we set the calendar fields via `Date.UTC(...)`, the
 * computation is independent of the system's local timezone — Cloud
 * Run UTC and a developer's PST laptop produce the same UTC instant
 * for the same inputs.
 *
 * Asia/Jakarta has no DST so the conversion is effectively `-7h`; the
 * code routes through `fromZonedTime` anyway so other configured
 * timezones (e.g. a future template with `Asia/Tokyo` or
 * `America/New_York`) get correct DST-aware arithmetic for free.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return fromZonedTime(wallClock, tz);
}

// ---------- Period math (TZ-aware) ----------

/** Start of the current period (00:00 of the right day in `tz`), returned as UTC. */
export function startOfPeriod(now: Date, frequency: Frequency, tz: string): Date {
  const wc = wallClockInTz(now, tz);

  if (frequency === 'daily') {
    return zonedWallClockToUtc(wc.year, wc.month, wc.day, 0, 0, tz);
  }
  if (frequency === 'weekly') {
    // Walk back to Monday in the target tz. We just shift the wall-clock
    // day and reconvert — anchors the result to the correct local Monday
    // even across DST boundaries.
    const daysBack = wc.weekday - 1;
    // Use the millisecond delta on the UTC-equivalent day-zero so the
    // resulting local date lands on Monday in `tz`.
    const monday = zonedWallClockToUtc(wc.year, wc.month, wc.day - daysBack, 0, 0, tz);
    return monday;
  }
  // monthly
  return zonedWallClockToUtc(wc.year, wc.month, 1, 0, 0, tz);
}

/**
 * The moment within the current period at which the template should fire,
 * as a UTC Date. Wall-clock math is done in the template's tz.
 */
export function dueMomentInPeriod(
  now: Date,
  frequency: Frequency,
  deadlineDay: number | null,
  deadlineTime: string | null,
  tz: string,
): Date {
  const wc = wallClockInTz(now, tz);

  // deadlineTime: HH:MM. Default 00:00.
  let hh = 0;
  let mm = 0;
  if (deadlineTime && /^\d{1,2}:\d{2}$/.test(deadlineTime)) {
    const [h, m] = deadlineTime.split(':').map((s) => parseInt(s, 10));
    hh = h;
    mm = m;
  }

  if (frequency === 'daily') {
    return zonedWallClockToUtc(wc.year, wc.month, wc.day, hh, mm, tz);
  }

  if (frequency === 'weekly') {
    const day = Math.min(Math.max(deadlineDay ?? 1, 1), 7);
    // Anchor on this week's Monday in tz, then add (day-1) days.
    const daysToShift = day - wc.weekday;
    return zonedWallClockToUtc(wc.year, wc.month, wc.day + daysToShift, hh, mm, tz);
  }

  // monthly
  const day = Math.min(Math.max(deadlineDay ?? 1, 1), 31);
  // Clamp to actual month length in the target tz: ask Intl for "day 0 of
  // next month" which is the last day of this month.
  const lastDayOfMonth = wallClockInTz(
    zonedWallClockToUtc(wc.year, wc.month + 1, 0, 12, 0, tz),
    tz,
  ).day;
  const clampedDay = Math.min(day, lastDayOfMonth);
  return zonedWallClockToUtc(wc.year, wc.month, clampedDay, hh, mm, tz);
}

interface SpawnResult {
  templateId: string;
  status: 'spawned' | 'skipped_already_fired' | 'skipped_not_due' | 'skipped_no_channel' | 'skipped_inactive' | 'error';
  taskId?: string;
  messageId?: string;
  error?: string;
  // Surfaced on every result so operator-side debugging from Cloud Run
  // logs doesn't need a separate trace. `tz` is the template's
  // configured zone (defaults to Asia/Jakarta); `dueAtUtc` is the
  // computed fire-moment for the current period in UTC ISO form so
  // log readers can compare it byte-for-byte against `runNowUtc` from
  // the run summary.
  tz?: string;
  dueAtUtc?: string;
}

/**
 * Resolve the template's mentionTarget into a concrete prefix + a set of user
 * ids to notify. Falls back to no-mention if the target is null or unresolvable
 * (e.g. the picked user was deleted between save and fire — better to post
 * silently than crash the scheduler).
 *
 * Channel-broadcast (mentionTarget="channel") notifies every channel member
 * other than the bot itself. Private channels use the explicit membership
 * list; public channels expand to all active users to match the existing
 * channel-message notification semantics.
 */
async function resolveMention(
  mentionTarget: string | null,
  channelId: string,
  botId: string,
): Promise<{ prefix: string; mentionedUserIds: string[] }> {
  if (!mentionTarget || mentionTarget === 'none') {
    return { prefix: '', mentionedUserIds: [] };
  }

  if (mentionTarget === 'channel') {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { isPrivate: true },
    });
    let ids: string[];
    if (channel?.isPrivate) {
      const members = await prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      });
      ids = members.map((m) => m.userId);
    } else {
      const users = await prisma.user.findMany({
        where: { accountStatus: 'active' },
        select: { id: true },
      });
      ids = users.map((u) => u.id);
    }
    return {
      prefix: '@channel ',
      mentionedUserIds: ids.filter((id) => id !== botId),
    };
  }

  // Specific user id. Look up the name so the @-handle in the message text
  // matches the rendered mention chip convention (`@<First.Last>`).
  const user = await prisma.user.findUnique({
    where: { id: mentionTarget },
    select: { id: true, name: true, accountStatus: true },
  });
  if (!user || user.accountStatus !== 'active') {
    return { prefix: '', mentionedUserIds: [] };
  }
  const handle = user.name.replace(/\s+/g, '.');
  return { prefix: `@${handle} `, mentionedUserIds: [user.id] };
}

/** Build the channel-message body the bot posts. Keep terse — the card UI
 *  carries the action. Format: ⏰ leads as a visual anchor, then the
 *  @mention (if any), then the template name and frequency. */
function renderBotMessage(
  template: { name: string; description: string | null; frequency: string },
  taskId: string,
  mentionPrefix: string,
): string {
  const lines = [
    `<!--routine_task:${taskId}-->`,
    `⏰ ${mentionPrefix}${template.name} ~ ${template.frequency}`,
  ];
  if (template.description?.trim()) lines.push(template.description.trim());
  return lines.join('\n');
}

/**
 * Spawn a Task for one template if it's due and hasn't fired yet this period.
 * `force=true` skips the period-dedup check (used by the manual "Run now"
 * endpoint).
 */
export async function spawnTaskIfDue(templateId: string, now: Date, force = false): Promise<SpawnResult> {
  const template = await prisma.routineTaskTemplate.findUnique({
    where: { id: templateId },
    include: { checklistItems: { orderBy: { position: 'asc' } } },
  });
  if (!template) {
    return { templateId, status: 'skipped_inactive' };
  }
  // Default tz to Asia/Jakarta to match the schema default — and so legacy
  // rows that predate the column have stable behaviour. Resolved up here
  // so we can stamp it onto every early-return shape, which makes the
  // Cloud Run logs self-explanatory.
  const tz = template.timezone || 'Asia/Jakarta';
  if (!template.isActive) {
    return { templateId, status: 'skipped_inactive', tz };
  }
  if (!template.channelId) {
    // Channel-card flow only — templates without a channel target stay /orbit-only.
    return { templateId, status: 'skipped_no_channel', tz };
  }

  const freq = template.frequency as Frequency;
  if (!['daily', 'weekly', 'monthly'].includes(freq)) {
    return { templateId, status: 'error', error: `Unsupported frequency: ${freq}`, tz };
  }
  const periodStart = startOfPeriod(now, freq, tz);
  const dueAt = dueMomentInPeriod(now, freq, template.deadlineDay, template.deadlineTime, tz);
  const dueAtUtc = dueAt.toISOString();

  if (!force) {
    // Has this template already fired in the current period? If yes, no-op.
    const existing = await prisma.task.findFirst({
      where: { routineTemplateId: template.id, createdAt: { gte: periodStart } },
      select: { id: true },
    });
    if (existing) {
      return { templateId, status: 'skipped_already_fired', taskId: existing.id, tz, dueAtUtc };
    }

    // Not yet at the due moment for this period? Wait for a later run.
    // This is the rolling-window check: any cron run with `now >= dueAt`
    // within the current period will spawn (modulo the existing-task
    // dedup above). So a cron delayed by a few minutes after 13:00 WIB
    // still fires for "today"; a cron that hasn't run in a few hours
    // catches up the moment it does run.
    if (now < dueAt) {
      return { templateId, status: 'skipped_not_due', tz, dueAtUtc };
    }
  }

  const bot = await getOrCreateSystemBot();
  const templateType = template.type ?? (template.isTeamWide ? 'TEAM' : 'INDIVIDUAL');

  // Resolve the mention before the transaction so the @-prefix gets baked
  // into the message text. Fan-out notifications are written after the
  // transaction commits — a fanout failure shouldn't roll back the spawn.
  const { prefix, mentionedUserIds } = await resolveMention(
    template.mentionTarget,
    template.channelId,
    bot.id,
  );

  // Spawn Task + ChecklistItems + ChannelMessage as one transaction so the
  // card-message and its underlying task are atomic — no orphan messages
  // pointing at a Task that never got written.
  try {
    const { task, message } = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: template.name,
          description: template.description,
          status: 'todo',
          priority: 'medium',
          type: templateType,
          routineTemplateId: template.id,
          referenceUrls: template.referenceUrls,
          source: 'direct_assign',
          targetChannelId: template.channelId,
          assignedTeamId: template.teamId ?? null,
          isRecurring: true,
          recurrenceType: template.frequency,
          // No assignee yet — INDIVIDUAL waits for a Claim Task click, TEAM
          // never assigns at the task level (per-item only).
          checklistItems: template.checklistItems.length > 0
            ? {
                create: template.checklistItems.map((it) => ({
                  title: it.title,
                  position: it.position,
                })),
              }
            : undefined,
        },
        select: { id: true, title: true },
      });

      const message = await tx.channelMessage.create({
        data: {
          channelId: template.channelId!,
          senderId: bot.id,
          content: renderBotMessage(template, task.id, prefix),
          attachments: [],
          // `mentions` mirrors the resolved user-id list so the rest of the
          // app (badges, unread counts, search) treats this exactly like a
          // human-sent @-mention.
          mentions: mentionedUserIds,
        },
        select: { id: true },
      });

      await tx.task.update({
        where: { id: task.id },
        data: { channelMessageId: message.id },
      });

      await tx.channel.update({
        where: { id: template.channelId! },
        data: { updatedAt: new Date() },
      });

      return { task, message };
    });

    // Notification fan-out: mirror the channel-message endpoint's pattern so
    // mentioned users get the standard "AHABOT mentioned you in #channel"
    // entry that the bell icon / unread badges already understand.
    if (mentionedUserIds.length > 0) {
      const channel = await prisma.channel.findUnique({
        where: { id: template.channelId },
        select: { name: true },
      });
      await prisma.notification.createMany({
        data: mentionedUserIds.map((uid) => ({
          userId: uid,
          type: 'mention',
          title: `AHABOT mentioned you in #${channel?.name || 'channel'}`,
          message: `⏰ ${template.name}`.slice(0, 80),
          data: {
            channel_id: template.channelId,
            message_id: message.id,
            sender_id: bot.id,
            sender_name: 'AHABOT',
            routine_task_id: task.id,
          },
        })),
      });
    }

    return { templateId, status: 'spawned', taskId: task.id, messageId: message.id, tz, dueAtUtc };
  } catch (err: any) {
    return { templateId, status: 'error', error: err?.message || 'unknown', tz, dueAtUtc };
  }
}

/**
 * Run the scheduler over every active template. Returns a per-template
 * summary the cron endpoint can log/return.
 *
 * Defense-in-depth: this function never throws to the caller. The
 * top-level try/catch absorbs any DB / Intl / unexpected runtime
 * failure and emits one structured `CRON ROUTINE FAILED` log line so
 * the Cloud Run terminal carries a readable stack trace. The cron
 * endpoint also catches at its layer (route.ts) — that's the second
 * line of defense, in case this function ever gets misused outside
 * its current single caller.
 *
 * Per-template defense: spawnTaskIfDue has its own try/catch around
 * the spawn transaction (returns `status: 'error'` on failure), but
 * the read-side calls before the transaction (`findUnique`,
 * `findFirst`, `getOrCreateSystemBot`) can still throw. We wrap the
 * per-template call here so one template's failure can't abort the
 * sweep — every other active template still gets a chance to fire.
 *
 * No auth context required. The cron path is headless: it does not
 * call `requireFastAuth` anywhere (audited 2026-05-19), does not
 * read `session` / `currentUser` from anything, and the system-bot
 * row used as the message author is created idempotently from the
 * server-side prisma client.
 */
export async function runScheduler(now: Date = new Date()): Promise<SpawnResult[]> {
  const runNowUtc = now.toISOString();
  try {
    const templates = await prisma.routineTaskTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    console.log(`[routine-scheduler] run start runNowUtc=${runNowUtc} activeTemplates=${templates.length}`);

    const results: SpawnResult[] = [];
    // Sequential — keeps log output coherent and avoids hammering the DB with
    // a stampede of transactions. Templates are O(tens), not O(thousands).
    for (const t of templates) {
      let result: SpawnResult;
      try {
        result = await spawnTaskIfDue(t.id, now);
      } catch (err: any) {
        // Read-path throw (template lookup, period-dedup query, bot
        // upsert, mention resolution) — never let it abort the sweep.
        // Log a full stack trace so the operator can read it directly
        // from Cloud Run logs.
        console.error(`CRON ROUTINE FAILED for template=${t.id}:`, err);
        result = {
          templateId: t.id,
          status: 'error',
          error: err?.message || 'unknown',
        };
      }
      // One log line per template so a missed/skipped fire is visible
      // in Cloud Run logs without trawling through a JSON payload. The
      // `dueAtUtc` and `tz` fields make it possible to verify timezone
      // alignment without re-running locally.
      console.log(
        `[routine-scheduler] template=${t.id} name="${t.name}" status=${result.status}`
        + ` tz=${result.tz ?? '-'} dueAtUtc=${result.dueAtUtc ?? '-'}`
        + (result.taskId ? ` taskId=${result.taskId}` : '')
        + (result.error ? ` error="${result.error}"` : ''),
      );
      results.push(result);
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[routine-scheduler] run end runNowUtc=${runNowUtc} summary=${JSON.stringify(summary)}`);

    return results;
  } catch (err: any) {
    // Top-level guard. Anything that throws before / outside the
    // per-template loop (initial findMany, etc.) lands here. We log
    // the full stack trace as a single structured line so it's easy
    // to grep out of Cloud Run logs, and return an empty result set
    // rather than re-throwing — the cron endpoint reports the empty
    // summary back to Cloud Scheduler which retries per the
    // retry_config in cloud-scheduler.tf.
    console.error('CRON ROUTINE FAILED at top level:', err);
    return [];
  }
}
