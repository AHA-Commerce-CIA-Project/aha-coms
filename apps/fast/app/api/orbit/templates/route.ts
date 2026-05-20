import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';

// "none" / empty → null; "channel" → "channel"; anything else stored as-is
// (expected to be a user id, resolved at spawn time).
function normalizeMentionTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'none') return null;
  return v;
}

// Accept absolute http(s) URLs only — keeps card rendering simple and blocks
// `javascript:`/`data:` schemes. Returns null when invalid so callers can
// drop bad entries from an array cleanly.
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

// Validate IANA timezone strings by feeding them to Intl.DateTimeFormat —
// invalid values throw RangeError. Falls back to the schema default so a
// malformed client submission can't break scheduling.
function normalizeTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Asia/Jakarta';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'Asia/Jakarta';
  }
}

const TEMPLATES_DEFAULT_TAKE = 50;
const TEMPLATES_MAX_TAKE = 200;

export async function GET(request: Request) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const take = Math.min(
    Math.max(1, parseInt(searchParams.get('take') ?? String(TEMPLATES_DEFAULT_TAKE), 10) || TEMPLATES_DEFAULT_TAKE),
    TEMPLATES_MAX_TAKE,
  );
  const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true, role: true },
  });

  // Visibility: empty teamIds + no teamId → all teams; otherwise must include user's team.
  // Master/admin always sees everything.
  const allTemplates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    include: {
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true } },
      checklistItems: { orderBy: { position: 'asc' } },
    },
    orderBy: [{ frequency: 'asc' }, { name: 'asc' }],
    take,
    skip,
  });

  if (user?.role === 'admin') {
    return NextResponse.json(allTemplates);
  }

  const filtered = allTemplates.filter(t => {
    const ids = Array.isArray(t.teamIds) ? t.teamIds as string[] : [];
    if (ids.length === 0 && !t.teamId) return true;
    if (user?.teamId && ids.includes(user.teamId)) return true;
    if (user?.teamId && t.teamId === user.teamId) return true;
    return false;
  });

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const session = await requireFastAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only leaders can create routine tasks' }, { status: 403 });
  }

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

  if (!name?.trim() || !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return NextResponse.json({ error: 'Name and valid frequency required' }, { status: 400 });
  }

  const templateType = type === 'TEAM' ? 'TEAM' : 'INDIVIDUAL';
  const items: { title: string; position: number }[] = Array.isArray(checklistItems)
    ? checklistItems
        .map((it: any, idx: number) => ({ title: String(it?.title ?? '').trim(), position: idx }))
        .filter((it) => it.title.length > 0)
    : [];

  if (templateType === 'TEAM' && items.length === 0) {
    return NextResponse.json(
      { error: 'TEAM templates need at least one checklist item — these are what members claim.' },
      { status: 400 },
    );
  }

  const template = await prisma.routineTaskTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      frequency,
      category: category?.trim() || null,
      type: templateType,
      channelId: channelId || null,
      mentionTarget: normalizeMentionTarget(mentionTarget),
      referenceUrls: normalizeReferenceUrls(referenceUrls),
      timezone: normalizeTimezone(timezone),
      deadlineTime: deadlineTime || null,
      deadlineDay: deadlineDay ? parseInt(deadlineDay) : null,
      teamId: (teamIds && teamIds.length > 0) ? teamIds[0] : (teamId || null),
      teamIds: teamIds && teamIds.length > 0 ? teamIds : [],
      isTeamWide: !!isTeamWide,
      createdBy: session.user.id,
      checklistItems: items.length > 0 ? { create: items } : undefined,
    },
    include: {
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true } },
      checklistItems: { orderBy: { position: 'asc' } },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
