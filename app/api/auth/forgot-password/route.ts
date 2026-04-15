import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Find user by email
        const user = await prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true, name: true, email: true, accountStatus: true },
        });

        // Always return success to prevent email enumeration
        if (!user || user.accountStatus !== 'active') {
            return NextResponse.json({
                status: 'success',
                message: 'If an account exists with this email, a reset code has been sent.',
            });
        }

        // Invalidate existing unused tokens
        await prisma.passwordResetToken.updateMany({
            where: { email: user.email, used: false },
            data: { used: true },
        });

        // Generate 6-digit code
        const code = crypto.randomInt(100000, 999999).toString();

        await prisma.passwordResetToken.create({
            data: {
                email: user.email,
                token: code,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            },
        });

        // Send reset email with code
        await sendPasswordResetEmail(user.email, user.name || 'User', code);

        return NextResponse.json({
            status: 'success',
            message: 'If an account exists with this email, a reset code has been sent.',
        });
    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
