import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET /api/channels/[channelId]/members - List channel members
export async function GET(
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
    select: { isPrivate: true, createdBy: true },
  });

  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.isPrivate) {
    // Return creator + explicit members
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true, role: true },
        },
      },
    });

    const creator = await prisma.user.findUnique({
      where: { id: channel.createdBy },
      select: { id: true, name: true, email: true, image: true, role: true },
    });

    const memberList = members.map((m) => ({ ...m.user, isCreator: false }));
    if (creator && !memberList.some((m) => m.id === creator.id)) {
      memberList.unshift({ ...creator, isCreator: true });
    } else if (creator) {
      const idx = memberList.findIndex((m) => m.id === creator.id);
      if (idx >= 0) memberList[idx].isCreator = true;
    }

    return NextResponse.json(memberList);
  } else {
    // Public channel: return all users
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true, role: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(
      users.map((u) => ({ ...u, isCreator: u.id === channel.createdBy }))
    );
  }
}
