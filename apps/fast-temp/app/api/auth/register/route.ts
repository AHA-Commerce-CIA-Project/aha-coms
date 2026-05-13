import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendActivationEmail } from '@/lib/email';
import { logActivity } from '@/lib/activity-log';
import crypto from 'crypto';

// POST /api/auth/register - Step 1: Register with name + email
export async function POST(request: Request) {
  const { name, email } = await request.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
  }

  if (!email?.trim() || !email.endsWith('@ahacommerce.net')) {
    return NextResponse.json({ error: 'A valid @ahacommerce.net email is required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already registered
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    if (existingUser.accountStatus === 'active') {
      return NextResponse.json({ error: 'This email is already registered. Please log in.' }, { status: 409 });
    }
    if (existingUser.accountStatus === 'pending_approval') {
      return NextResponse.json({ error: 'Your account is pending leader approval. Please wait.' }, { status: 409 });
    }
    if (existingUser.accountStatus === 'rejected') {
      return NextResponse.json({ error: 'Your registration was previously declined. Please contact a team leader.' }, { status: 409 });
    }
    // If pending_activation or pending_setup, resend activation
  }

  // Check for existing unused token
  const existingToken = await prisma.activationToken.findFirst({
    where: { email: normalizedEmail, used: false, expiresAt: { gt: new Date() } },
  });

  if (existingToken) {
    // Resend the same token
    await sendActivationEmail(normalizedEmail, name.trim(), existingToken.token);
    return NextResponse.json({ message: 'Activation email sent. Please check your inbox.' });
  }

  // Generate new activation token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.activationToken.create({
    data: {
      email: normalizedEmail,
      name: name.trim(),
      token,
      expiresAt,
    },
  });

  // Send activation email
  await sendActivationEmail(normalizedEmail, name.trim(), token);

  // Log activity
  logActivity('system', 'user_registered', `${name.trim()} (${normalizedEmail}) registered a new account`, 'user');

  return NextResponse.json({ message: 'Activation email sent. Please check your inbox.' });
}
