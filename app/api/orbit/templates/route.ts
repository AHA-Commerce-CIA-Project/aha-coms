import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get current user's team to filter templates
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamId: true, role: true },
  });

  // Build where clause: show templates for user's team OR templates with no team
  // Master/admin sees all templates
  // Note: teamIds is a JSON array. For visibility:
  // - Templates with no teams (teamIds=[] AND teamId=null) → visible to all
  // - Templates with teamIds containing user's team → visible
  // - Templates with teamId matching user's team → visible (legacy)
  const allTemplates = await prisma.routineTaskTemplate.findMany({
    where: { isActive: true },
    include: {
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ frequency: 'asc' }, { name: 'asc' }],
  });

  if (user?.role === 'admin') {
    return NextResponse.json(allTemplates);
  }

  const filtered = allTemplates.filter(t => {
    const ids = Array.isArray(t.teamIds) ? t.teamIds as string[] : [];
    if (ids.length === 0 && !t.teamId) return true; // visible to all
    if (user?.teamId && ids.includes(user.teamId)) return true;
    if (user?.teamId && t.teamId === user.teamId) return true;
    return false;
  });

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only leaders can create routine tasks' }, { status: 403 });
  }

  const { name, description, frequency, category, deadlineTime, deadlineDay, teamId, teamIds, isTeamWide } = await request.json();

  if (!name?.trim() || !['daily', 'weekly', 'monthly'].includes(frequency)) {
    return NextResponse.json({ error: 'Name and valid frequency required' }, { status: 400 });
  }

  const template = await prisma.routineTaskTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      frequency,
      category: category?.trim() || null,
      deadlineTime: deadlineTime || null,
      deadlineDay: deadlineDay ? parseInt(deadlineDay) : null,
      teamId: (teamIds && teamIds.length > 0) ? teamIds[0] : (teamId || null),
      teamIds: teamIds && teamIds.length > 0 ? teamIds : [],
      isTeamWide: !!isTeamWide,
      createdBy: session.user.id,
    },
    include: {
      creator: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
