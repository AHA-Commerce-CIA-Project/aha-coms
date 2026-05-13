import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

function normalizeMentionTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'none') return null;
  return v;
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeReferenceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const clean = sanitizeUrl(raw);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Asia/Jakarta';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'Asia/Jakarta';
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const {
    name,
    description,
    frequency,
    category,
    type,
    channelId,
    mentionTarget,
    referenceUrls,
    timezone,
    deadlineTime,
    deadlineDay,
    teamId,
    teamIds,
    isTeamWide,
    checklistItems,
  } = await request.json();

  // Checklist replacement is opt-in: only touch items if the client actually
  // sent a `checklistItems` array. Sending an empty array is a deliberate
  // "remove everything" — we honor it, then re-validate TEAM-needs-items.
  const itemsProvided = Array.isArray(checklistItems);
  const items: { title: string; position: number }[] = itemsProvided
    ? checklistItems
        .map((it: any, idx: number) => ({ title: String(it?.title ?? '').trim(), position: idx }))
        .filter((it) => it.title.length > 0)
    : [];

  if (itemsProvided && type === 'TEAM' && items.length === 0) {
    return NextResponse.json(
      { error: 'TEAM templates need at least one checklist item.' },
      { status: 400 },
    );
  }

  const template = await prisma.$transaction(async (tx) => {
    if (itemsProvided) {
      await tx.templateChecklistItem.deleteMany({ where: { templateId: id } });
      if (items.length > 0) {
        await tx.templateChecklistItem.createMany({
          data: items.map((it) => ({ ...it, templateId: id })),
        });
      }
    }

    return tx.routineTaskTemplate.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(frequency ? { frequency } : {}),
        ...(category !== undefined ? { category: category?.trim() || null } : {}),
        ...(type ? { type: type === 'TEAM' ? 'TEAM' : 'INDIVIDUAL' } : {}),
        ...(channelId !== undefined ? { channelId: channelId || null } : {}),
        ...(mentionTarget !== undefined ? { mentionTarget: normalizeMentionTarget(mentionTarget) } : {}),
        ...(referenceUrls !== undefined ? { referenceUrls: normalizeReferenceUrls(referenceUrls) } : {}),
        ...(timezone !== undefined ? { timezone: normalizeTimezone(timezone) } : {}),
        ...(deadlineTime !== undefined ? { deadlineTime: deadlineTime || null } : {}),
        ...(deadlineDay !== undefined ? { deadlineDay: deadlineDay ? parseInt(deadlineDay) : null } : {}),
        ...(teamIds !== undefined
          ? { teamIds, teamId: teamIds.length > 0 ? teamIds[0] : null }
          : teamId !== undefined
            ? { teamId: teamId || null }
            : {}),
        ...(isTeamWide !== undefined ? { isTeamWide: !!isTeamWide } : {}),
      },
      include: {
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        channel: { select: { id: true, name: true } },
        checklistItems: { orderBy: { position: 'asc' } },
      },
    });
  });

  return NextResponse.json(template);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireFastAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  await prisma.routineTaskTemplate.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
