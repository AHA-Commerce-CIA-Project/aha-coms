import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { logActivity } from '@/lib/activity-log';

// GET /api/auth/activate?token=xxx - Validate activation token
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  const activation = await prisma.activationToken.findUnique({
    where: { token },
  });

  if (!activation) {
    return NextResponse.json({ error: 'Invalid activation token' }, { status: 404 });
  }

  if (activation.used) {
    return NextResponse.json({ error: 'This activation link has already been used' }, { status: 400 });
  }

  if (activation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This activation link has expired. Please register again.' }, { status: 400 });
  }

  // Get teams for the setup form
  const teams = await prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    valid: true,
    email: activation.email,
    name: activation.name,
    teams,
  });
}

// POST /api/auth/activate - Complete activation: set password + team
export async function POST(request: Request) {
  const { token, password, teamId } = await request.json();

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const activation = await prisma.activationToken.findUnique({
    where: { token },
  });

  if (!activation || activation.used || activation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired activation token' }, { status: 400 });
  }

  try {
    // Create the user via Better Auth signUp
    const result = await auth.api.signUpEmail({
      body: {
        name: activation.name,
        email: activation.email,
        password,
      },
    });

    if (!result?.user?.id) {
      throw new Error('Failed to create account');
    }

    // Update user with team and account status
    await prisma.user.update({
      where: { id: result.user.id },
      data: {
        teamId: teamId || null,
        accountStatus: 'pending_approval',
        emailVerified: true,
      },
    });

    // Mark token as used
    await prisma.activationToken.update({
      where: { id: activation.id },
      data: { used: true },
    });

    // Notify leaders
    const leaders = await prisma.user.findMany({
      where: { role: { in: ['leader', 'admin'] }, accountStatus: 'active' },
      select: { id: true },
    });

    if (leaders.length > 0) {
      await prisma.notification.createMany({
        data: leaders.map((l) => ({
          userId: l.id,
          type: 'account_pending',
          title: 'New Account Pending Approval',
          message: `${activation.name} (${activation.email}) has registered and is waiting for approval.`,
          data: { userId: result.user.id, email: activation.email },
        })),
      });
    }

    logActivity(result.user.id, 'account_activated', `${activation.name} activated their account and is pending approval`, 'user', result.user.id);

    return NextResponse.json({ success: true, message: 'Account created. Waiting for leader approval.' });
  } catch (err: any) {
    console.error('Activation error:', err);
    // Check if user already exists
    if (err.message?.includes('already exists') || err.code === 'USER_ALREADY_EXISTS') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || 'Failed to create account' }, { status: 500 });
  }
}
