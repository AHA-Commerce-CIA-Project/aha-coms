import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';
import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';

// POST /api/auth/approve/[userId] - Approve or reject user
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'leader' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Only leaders can approve users' }, { status: 403 });
  }

  const { userId } = await params;
  const { action } = await request.json(); // 'approve' or 'reject'

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, accountStatus: true },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.accountStatus !== 'pending_approval') {
    return NextResponse.json({ error: 'User is not pending approval' }, { status: 400 });
  }

  if (action === 'approve') {
    await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'active' },
    });

    sendAccountApprovedEmail(user.email, user.name).catch(() => {});
    logActivity(session.user.id, 'user_approved', `${session.user.name} approved ${user.name}'s account (${user.email})`, 'user', userId);

    return NextResponse.json({ success: true, action: 'approved' });
  } else if (action === 'reject') {
    await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'rejected' },
    });

    sendAccountRejectedEmail(user.email, user.name).catch(() => {});
    logActivity(session.user.id, 'user_rejected', `${session.user.name} rejected ${user.name}'s account (${user.email})`, 'user', userId);

    return NextResponse.json({ success: true, action: 'rejected' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
