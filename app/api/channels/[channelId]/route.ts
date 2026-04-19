import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// DELETE /api/channels/[channelId] - Only the creator can delete their own channel
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdBy: true },
  });

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: 'Only the channel creator can delete this channel' },
      { status: 403 }
    );
  }

  await prisma.channel.delete({ where: { id: channelId } });

  return NextResponse.json({ success: true });
}

// PATCH /api/channels/[channelId] - Only the creator can edit their own channel
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { createdBy: true },
  });

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: 'Only the channel creator can edit this channel' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, description, isPrivate, allowedTeamIds } = body;

  const data: {
    name?: string;
    description?: string | null;
    isPrivate?: boolean;
    allowedTeamIds?: string[];
  } = {};

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: 'Channel name cannot be empty' }, { status: 400 });
    }
    data.name = trimmed;
  }

  if (typeof description === 'string' || description === null) {
    data.description = typeof description === 'string' ? description.trim() || null : null;
  }

  if (typeof isPrivate === 'boolean') {
    data.isPrivate = isPrivate;
  }

  if (Array.isArray(allowedTeamIds)) {
    data.allowedTeamIds = [
      ...new Set(
        allowedTeamIds.filter((t: unknown) => typeof t === 'string' && t.length > 0)
      ),
    ] as string[];
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { messages: true, members: true } },
    },
  });

  return NextResponse.json(updated);
}
