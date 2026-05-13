import { NextRequest, NextResponse } from 'next/server';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { prisma } from '@/lib/db';
import { Storage } from '@google-cloud/storage';

const ALLOWED_TYPES: Record<string, string[]> = {
    image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
    ],
};

const ALL_ALLOWED = [...ALLOWED_TYPES.image, ...ALLOWED_TYPES.document];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function uploadToGCS(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
    try {
        const bucketName = process.env.GCS_BUCKET_NAME;
        if (!bucketName) return null;

        const storage = new Storage();
        const bucket = storage.bucket(bucketName);
        const blob = bucket.file(`uploads/${filename}`);

        await blob.save(buffer, {
            contentType,
            metadata: { cacheControl: 'public, max-age=31536000' },
        });

        return `https://storage.googleapis.com/${bucketName}/uploads/${filename}`;
    } catch (err: any) {
        console.error('GCS upload error:', err.message);
        return null;
    }
}

export async function POST(request: NextRequest) {
    // Auth: either a valid session OR a (taskToken, taskId) pair matching a task.
    const session = await requireFastAuth();
    if (!session) {
        const token = request.nextUrl.searchParams.get('token');
        const taskId = request.nextUrl.searchParams.get('taskId');
        if (!token || !taskId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const task = await prisma.task.findFirst({
            where: { id: taskId, taskToken: token.toUpperCase() },
            select: { id: true },
        });
        if (!task) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!ALL_ALLOWED.includes(file.type)) {
            return NextResponse.json({
                error: 'Invalid file type. Allowed: images (PNG, JPEG, WebP, GIF) and documents (PDF, Word, Excel, PowerPoint, CSV, TXT).',
            }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
        }

        const isImage = ALLOWED_TYPES.image.includes(file.type);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${safeName}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const gcsUrl = await uploadToGCS(buffer, filename, file.type);

        const url = gcsUrl ?? `data:${file.type};base64,${buffer.toString('base64')}`;

        return NextResponse.json({
            url,
            name: file.name,
            type: file.type,
            size: file.size,
            isImage,
        });
    } catch (err: any) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
