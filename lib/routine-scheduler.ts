// Routine-reminder scheduler. Designed to be invoked on a cadence by Cloud
// Scheduler hitting POST /api/cron/routine-scheduler (or any cron that can
// hit an HTTP endpoint). Idempotent: runs that fire after a template has
// already spawned its Task for the current period are a no-op.
//
// Time handling: all comparisons are in UTC. `deadlineTime` (HH:MM) on the
// template is interpreted as UTC for now — a future enhancement could carry
// a timezone per template, but until then it's the operator's job to set
// times in UTC.

import { prisma } from '@/lib/db';
import { getOrCreateSystemBot } from '@/lib/system-bot';

type Frequency = 'daily' | 'weekly' | 'monthly';

/** Start of the current period for the given frequency, in UTC. */
export function startOfPeriod(now: Date, frequency: Frequency): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (frequency === 'daily') return d;
  if (frequency === 'weekly') {
    // ISO week starts Monday. JS Sunday=0, so shift.
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d;
  }
  // monthly
  d.setUTCDate(1);
  return d;
}

/**
 * The moment within the current period at which the template should fire.
 * Falls back gracefully when deadlineDay/deadlineTime aren't set — never
 * returns null so the caller can always compare against `now`.
 */
export function dueMomentInPeriod(
  now: Date,
  frequency: Frequency,
  deadlineDay: number | null,
  deadlineTime: string | null,
): Date {
  const base = startOfPeriod(now, frequency);
  const due = new Date(base);

  if (frequency === 'weekly') {
    // deadlineDay 1=Mon..7=Sun. Default Monday.
    const day = Math.min(Math.max(deadlineDay ?? 1, 1), 7);
    due.setUTCDate(due.getUTCDate() + (day - 1));
  } else if (frequency === 'monthly') {
    // deadlineDay 1-31. Clamp to month length so Feb-30 doesn't roll into March.
    const day = Math.min(Math.max(deadlineDay ?? 1, 1), 31);
    const monthEnd = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
    due.setUTCDate(Math.min(day, monthEnd));
  }

  // deadlineTime: HH:MM. Default 00:00.
  if (deadlineTime && /^\d{1,2}:\d{2}$/.test(deadlineTime)) {
    const [h, m] = deadlineTime.split(':').map((s) => parseInt(s, 10));
    due.setUTCHours(h, m, 0, 0);
  } else {
    due.setUTCHours(0, 0, 0, 0);
  }
  return due;
}

interface SpawnResult {
  templateId: string;
  status: 'spawned' | 'skipped_already_fired' | 'skipped_not_due' | 'skipped_no_channel' | 'error';
  taskId?: string;
  messageId?: string;
  error?: string;
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
  if (!template || !template.isActive) {
    return { templateId, status: 'skipped_not_due' };
  }
  if (!template.channelId) {
    // Channel-card flow only — templates without a channel target stay /orbit-only.
    return { templateId, status: 'skipped_no_channel' };
  }

  const freq = template.frequency as Frequency;
  if (!['daily', 'weekly', 'monthly'].includes(freq)) {
    return { templateId, status: 'error', error: `Unsupported frequency: ${freq}` };
  }

  const periodStart = startOfPeriod(now, freq);

  if (!force) {
    // Has this template already fired in the current period? If yes, no-op.
    const existing = await prisma.task.findFirst({
      where: { routineTemplateId: template.id, createdAt: { gte: periodStart } },
      select: { id: true },
    });
    if (existing) {
      return { templateId, status: 'skipped_already_fired', taskId: existing.id };
    }

    // Not yet at the due moment for this period? Wait for a later run.
    const dueAt = dueMomentInPeriod(now, freq, template.deadlineDay, template.deadlineTime);
    if (now < dueAt) {
      return { templateId, status: 'skipped_not_due' };
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

    return { templateId, status: 'spawned', taskId: task.id, messageId: message.id };
  } catch (err: any) {
    return { templateId, status: 'error', error: err?.message || 'unknown' };
  }
}

/**
 * Run the scheduler over every active template. Returns a per-template
 * summary the cron endpoint can log/return.
 */
export async function runScheduler(now: Date = new Date()): Promise<SpawnResult[]> {
  const templates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results: SpawnResult[] = [];
  // Sequential — keeps log output coherent and avoids hammering the DB with
  // a stampede of transactions. Templates are O(tens), not O(thousands).
  for (const t of templates) {
    results.push(await spawnTaskIfDue(t.id, now));
  }
  return results;
}
