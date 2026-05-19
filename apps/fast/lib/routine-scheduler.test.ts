/**
 * Unit tests for the routine-reminder scheduler's past-due sweep behaviour.
 *
 * The brief that introduced these tests: a daily template scheduled for
 * 16:40 WIB failed to fire by 16:42. Root cause was infra (no Cloud
 * Scheduler job calling the endpoint at all — fixed in PR #59 by adding
 * `infra/fast/cloud-scheduler.tf`), but the scheduler's spawn predicate
 * is what governs whether a delayed cron run still fires the template.
 * These tests pin that contract:
 *
 *   1. If `now < dueAt` for the current period, the template is
 *      `skipped_not_due`.
 *   2. If `now >= dueAt` and no task has been created for the current
 *      period, the template is `spawned`. This is the rolling-window
 *      guarantee — a cron tick delayed by minutes (or hours) past the
 *      scheduled time still fires for the right period.
 *   3. If a task already exists for the current period, the template
 *      is `skipped_already_fired` — period-scoped dedup so a cron that
 *      runs multiple times after `dueAt` only spawns once.
 *
 * Prisma + the bot loader are mocked so no DB or external dep is
 * required. Tests pin the date math via fixed UTC instants chosen so
 * the WIB wall-clock is unambiguous (Asia/Jakarta = UTC+7, no DST).
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requireFastAuthMock = mock(async () => null); // unused — included for shape symmetry

const findUniqueMock = mock(async () => null as unknown);
const findFirstMock = mock(async () => null as unknown);
const findManyMock = mock(async () => [] as unknown[]);
const createMock = mock(async () => ({ id: 'task-new', title: 'spawned' }));
const messageCreateMock = mock(async () => ({ id: 'msg-new' }));
const taskUpdateMock = mock(async () => ({ id: 'task-new' }));
const channelUpdateMock = mock(async () => ({ id: 'ch-1' }));
const channelFindUniqueMock = mock(async () => ({ name: 'general', isPrivate: false }));
const userFindManyMock = mock(async () => [] as unknown[]);
const userFindUniqueMock = mock(async () => null as unknown);
const channelMemberFindManyMock = mock(async () => [] as unknown[]);
const notificationCreateManyMock = mock(async () => ({ count: 0 }));

mock.module('@/lib/auth/require-fast-auth', () => ({
  requireFastAuth: requireFastAuthMock,
}));

mock.module('@/lib/system-bot', () => ({
  getOrCreateSystemBot: async () => ({ id: 'bot-1' }),
}));

mock.module('@/lib/db', () => ({
  prisma: {
    routineTaskTemplate: {
      findUnique: findUniqueMock,
      findMany: findManyMock,
    },
    task: {
      findFirst: findFirstMock,
      create: createMock,
      update: taskUpdateMock,
    },
    channelMessage: {
      create: messageCreateMock,
    },
    channel: {
      update: channelUpdateMock,
      findUnique: channelFindUniqueMock,
    },
    user: {
      findMany: userFindManyMock,
      findUnique: userFindUniqueMock,
    },
    channelMember: {
      findMany: channelMemberFindManyMock,
    },
    notification: {
      createMany: notificationCreateManyMock,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // Simplest possible transaction shim: pass the same mocked prisma
      // surface as the `tx` argument so the callback's tx.task.create /
      // tx.channelMessage.create / tx.task.update / tx.channel.update
      // calls route to the mocks above. The scheduler's transaction
      // body doesn't depend on real transactional isolation for the
      // dedup logic this test exercises — that's enforced by the
      // outer `findFirst` check, not the inner txn.
      return fn({
        task: { create: createMock, update: taskUpdateMock },
        channelMessage: { create: messageCreateMock },
        channel: { update: channelUpdateMock },
      });
    },
  },
}));

const { spawnTaskIfDue } = await import('./routine-scheduler');

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Daily standup reminder',
    description: null,
    isActive: true,
    channelId: 'ch-1',
    teamId: null,
    frequency: 'daily',
    deadlineTime: '16:40',
    deadlineDay: null,
    timezone: 'Asia/Jakarta',
    type: 'INDIVIDUAL',
    isTeamWide: false,
    mentionTarget: null,
    referenceUrls: [],
    checklistItems: [],
    ...overrides,
  };
}

describe('spawnTaskIfDue — past-due sweep behaviour', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    createMock.mockReset();
    messageCreateMock.mockReset();
    taskUpdateMock.mockReset();
    channelUpdateMock.mockReset();
    channelFindUniqueMock.mockReset();
    notificationCreateManyMock.mockReset();

    findFirstMock.mockImplementation(async () => null);
    createMock.mockImplementation(async () => ({ id: 'task-new', title: 'spawned' }));
    messageCreateMock.mockImplementation(async () => ({ id: 'msg-new' }));
    taskUpdateMock.mockImplementation(async () => ({ id: 'task-new' }));
    channelUpdateMock.mockImplementation(async () => ({ id: 'ch-1' }));
    channelFindUniqueMock.mockImplementation(async () => ({ name: 'general', isPrivate: false }));
    notificationCreateManyMock.mockImplementation(async () => ({ count: 0 }));
  });

  it('skips when now is before the due moment for the current period', async () => {
    // Template fires at 16:40 WIB daily. now = 16:39 WIB = 09:39 UTC.
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    const now = new Date('2026-05-19T09:39:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('skipped_not_due');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('spawns when the cron run is past the due moment and no task exists for today', async () => {
    // Template fires at 16:40 WIB daily. now = 16:42 WIB = 09:42 UTC —
    // the exact regression scenario from the brief.
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    const now = new Date('2026-05-19T09:42:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('spawned');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('still spawns when the cron run is several hours past the due moment (catch-up after a missed cadence)', async () => {
    // Template fires at 16:40 WIB. now = 22:00 WIB same day = 15:00 UTC.
    // No task exists in the current period → sweep catches up.
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    const now = new Date('2026-05-19T15:00:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('spawned');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes: a second cron run after a task has already spawned for the period skips with skipped_already_fired', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    findFirstMock.mockImplementationOnce(async () => ({ id: 'task-existing' }));
    const now = new Date('2026-05-19T09:45:00Z'); // 16:45 WIB

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('skipped_already_fired');
    expect(result.taskId).toBe('task-existing');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('exposes the computed dueAtUtc on every result so log readers can verify timezone alignment from Cloud Run logs', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    const now = new Date('2026-05-19T09:42:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    // 16:40 WIB on 2026-05-19 = 09:40 UTC
    expect(result.dueAtUtc).toBe('2026-05-19T09:40:00.000Z');
    expect(result.tz).toBe('Asia/Jakarta');
  });

  it('skips inactive templates', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeTemplate({ isActive: false }));
    const now = new Date('2026-05-19T09:45:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('skipped_inactive');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('skips templates with no channel target (they live on /orbit only)', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeTemplate({ channelId: null }));
    const now = new Date('2026-05-19T09:45:00Z');

    const result = await spawnTaskIfDue('tpl-1', now);

    expect(result.status).toBe('skipped_no_channel');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('force=true bypasses the period-dedup check (used by the manual Test Run button)', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeTemplate());
    findFirstMock.mockImplementationOnce(async () => ({ id: 'task-existing' }));
    const now = new Date('2026-05-19T09:45:00Z');

    const result = await spawnTaskIfDue('tpl-1', now, /* force= */ true);

    expect(result.status).toBe('spawned');
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------
// Weekly + day-of-week regression battery. The 2026-05-19 brief
// surfaced the exact scenario: a weekly template scheduled for
// Tuesday 17:10 WIB that failed to fire by 17:12. These tests pin
// the day-of-week mapping (ISO 1..7 with Sun=7) and the weekly
// past-due sweep so a regression in either piece fails CI.
// ------------------------------------------------------------------

function makeWeeklyTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-weekly',
    name: 'Tuesday standup',
    description: null,
    isActive: true,
    channelId: 'ch-1',
    teamId: null,
    frequency: 'weekly',
    // 2 = Tuesday in the ISO mapping the DB stores (Mon=1, Sun=7).
    deadlineDay: 2,
    deadlineTime: '17:10',
    timezone: 'Asia/Jakarta',
    type: 'INDIVIDUAL',
    isTeamWide: false,
    mentionTarget: null,
    referenceUrls: [],
    checklistItems: [],
    ...overrides,
  };
}

describe('spawnTaskIfDue — weekly Tuesday@17:10 WIB regression', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    createMock.mockReset();
    findFirstMock.mockImplementation(async () => null);
    createMock.mockImplementation(async () => ({ id: 'task-new', title: 'spawned' }));
    messageCreateMock.mockImplementation(async () => ({ id: 'msg-new' }));
    taskUpdateMock.mockImplementation(async () => ({ id: 'task-new' }));
    channelUpdateMock.mockImplementation(async () => ({ id: 'ch-1' }));
    channelFindUniqueMock.mockImplementation(async () => ({ name: 'general', isPrivate: false }));
    notificationCreateManyMock.mockImplementation(async () => ({ count: 0 }));
  });

  it('fires at 17:12 WIB Tuesday — the exact scenario from the brief', async () => {
    // 2026-05-19 was a Tuesday. 17:12 WIB = 10:12 UTC. A cron tick at
    // this moment should spawn the template because:
    //   • dueAt = 2026-05-19T10:10:00.000Z (Tuesday 17:10 WIB)
    //   • now (10:12 UTC) > dueAt
    //   • no existing task in current week period
    findUniqueMock.mockImplementationOnce(async () => makeWeeklyTemplate());
    const now = new Date('2026-05-19T10:12:00Z');

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('spawned');
    expect(result.tz).toBe('Asia/Jakarta');
    expect(result.dueAtUtc).toBe('2026-05-19T10:10:00.000Z');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('skips on Monday because dueAt for the current week is still in the future', async () => {
    // 2026-05-18 was a Monday. 17:10 WIB = 10:10 UTC. dueAt for the
    // week is Tuesday 17:10 WIB; now is one day earlier so we wait.
    findUniqueMock.mockImplementationOnce(async () => makeWeeklyTemplate());
    const now = new Date('2026-05-18T10:10:00Z');

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('skipped_not_due');
  });

  it('catches up on Wednesday if the Tuesday cron run was missed (no existing task in the week)', async () => {
    // 2026-05-20 is Wednesday. Tuesday's dueAt has passed and no task
    // was spawned for the week yet — rolling-window sweep fires now.
    findUniqueMock.mockImplementationOnce(async () => makeWeeklyTemplate());
    const now = new Date('2026-05-20T08:00:00Z');

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('spawned');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes within the same ISO week — Wednesday catch-up cancels if Tuesday already spawned', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeWeeklyTemplate());
    findFirstMock.mockImplementationOnce(async () => ({ id: 'task-tue' }));
    const now = new Date('2026-05-20T08:00:00Z'); // Wednesday

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('skipped_already_fired');
    expect(result.taskId).toBe('task-tue');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Sunday templates use ISO weekday 7 (date-fns getDay returns 0 — the remap is the critical bit)', async () => {
    // Sunday 12:00 WIB = 05:00 UTC. Template fires Sunday at 12:00.
    findUniqueMock.mockImplementationOnce(async () =>
      makeWeeklyTemplate({ deadlineDay: 7, deadlineTime: '12:00' }),
    );
    // 2026-05-24 = Sunday. 12:01 WIB = 05:01 UTC.
    const now = new Date('2026-05-24T05:01:00Z');

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('spawned');
    expect(result.dueAtUtc).toBe('2026-05-24T05:00:00.000Z');
  });

  it('Friday at 23:59 WIB is still inside the same ISO week as the Tuesday spawn — dedup holds', async () => {
    findUniqueMock.mockImplementationOnce(async () => makeWeeklyTemplate());
    findFirstMock.mockImplementationOnce(async () => ({ id: 'task-tue' }));
    // 2026-05-22 = Friday. 23:59 WIB = 16:59 UTC.
    const now = new Date('2026-05-22T16:59:00Z');

    const result = await spawnTaskIfDue('tpl-weekly', now);

    expect(result.status).toBe('skipped_already_fired');
    expect(createMock).not.toHaveBeenCalled();
  });
});
