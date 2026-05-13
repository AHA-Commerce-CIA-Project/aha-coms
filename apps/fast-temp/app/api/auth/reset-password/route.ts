import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from 'better-auth/crypto';

// POST /api/auth/reset-password?action=verify — Verify reset code
// POST /api/auth/reset-password?action=reset  — Reset the password
export async function POST(request: NextRequest) {
    const action = request.nextUrl.searchParams.get('action') || 'verify';

    try {
        const body = await request.json();

        if (action === 'verify') {
            // Step: verify the code
            const { email, code } = body;
            if (!email || !code) {
                return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
            }

            const resetToken = await prisma.passwordResetToken.findFirst({
                where: {
                    email: email.toLowerCase().trim(),
                    token: code.trim(),
                    used: false,
                },
            });

            if (!resetToken) {
                return NextResponse.json({ error: 'Invalid code. Please check and try again.' }, { status: 400 });
            }

            if (new Date() > resetToken.expiresAt) {
                return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
            }

            return NextResponse.json({ status: 'success', valid: true });
        }

        if (action === 'reset') {
            // Step: reset the password
            const { email, code, password } = body;

            if (!email || !code || !password) {
                return NextResponse.json({ error: 'Email, code, and password are required' }, { status: 400 });
            }

            if (password.length < 6) {
                return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
            }

            // Re-validate code
            const resetToken = await prisma.passwordResetToken.findFirst({
                where: {
                    email: email.toLowerCase().trim(),
                    token: code.trim(),
                    used: false,
                },
            });

            if (!resetToken || new Date() > resetToken.expiresAt) {
                return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
            }

            // Find user
            const user = await prisma.user.findFirst({
                where: { email: email.toLowerCase().trim() },
                select: { id: true },
            });

            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            // Hash and update password
            const hashedPassword = await hashPassword(password);
            await prisma.account.updateMany({
                where: { userId: user.id, providerId: 'credential' },
                data: { password: hashedPassword },
            });

            // Mark token as used
            await prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { used: true },
            });

            return NextResponse.json({
                status: 'success',
                message: 'Password has been reset successfully.',
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
