import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { invalidateFastAuthCache } from '@/lib/auth/load-fast-auth-user';
import { logActivity } from '@/lib/activity-log';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB upload limit (we'll resize down)
const AVATAR_SIZE = 128;

async function uploadToGCS(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
    try {
        const bucketName = process.env.GCS_BUCKET_NAME;
        if (!bucketName) return null;
        const storage = new Storage();
        const bucket = storage.bucket(bucketName);
        const blob = bucket.file(`avatars/${filename}`);
        await blob.save(buffer, {
            contentType,
            metadata: { cacheControl: 'public, max-age=31536000' },
        });
        return `https://storage.googleapis.com/${bucketName}/avatars/${filename}`;
    } catch (err: any) {
        console.error('GCS avatar upload error:', err.message);
        return null;
    }
}

export async function POST(request: NextRequest) {
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: 'Only PNG, JPEG, WebP, and GIF allowed' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const isAnimated = file.type === 'image/gif' || file.type === 'image/webp';

    let outputBuffer: Buffer;
    let outputType: string;
    let extension: string;

    try {
        if (isAnimated) {
            // Animated WebP: much smaller than GIF, preserves animation
            outputBuffer = await sharp(inputBuffer, { animated: true, pages: -1 })
                .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
                .webp({ quality: 75, effort: 4 })
                .toBuffer();
            outputType = 'image/webp';
            extension = 'webp';
        } else {
            outputBuffer = await sharp(inputBuffer)
                .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
                .webp({ quality: 80 })
                .toBuffer();
            outputType = 'image/webp';
            extension = 'webp';
        }
    } catch (err: any) {
        console.error('Sharp processing error:', err.message);
        return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
    }

    const filename = `${session.user.id}-${Date.now()}.${extension}`;
    const gcsUrl = await uploadToGCS(outputBuffer, filename, outputType);
    const imageUrl = gcsUrl ?? `data:${outputType};base64,${outputBuffer.toString('base64')}`;

    const user = await prisma.user.update({
        where: { id: session.user.id },
        data: { image: imageUrl, updatedAt: new Date() },
        select: { id: true, name: true, image: true },
    });

    // Drop the session-result cache entry for this caller so the next
    // requireFastAuth() round-trip re-reads from the DB and surfaces the
    // freshly-uploaded image. Without this, the in-memory cache (5-min
    // TTL keyed on the __session cookie) would keep returning the
    // pre-upload snapshot to header / sidebar reads — looking like the
    // upload silently reverted.
    const sessionCookie = (await cookies()).get('__session')?.value;
    if (sessionCookie) invalidateFastAuthCache(sessionCookie);

    logActivity(
        session.user.id,
        'profile_updated',
        `${user.name} updated their profile picture`,
        'user',
        session.user.id,
    );

    return NextResponse.json({
        ok: true,
        image: imageUrl,
        sizeKB: Math.round(outputBuffer.length / 1024),
    });
}
