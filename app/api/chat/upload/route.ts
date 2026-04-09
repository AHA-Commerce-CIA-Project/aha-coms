import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        const category = isImage ? 'images' : 'documents';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${safeName}`;

        // Save to public/uploads directory
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', category);
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, filename);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));

        const url = `/uploads/${category}/${filename}`;

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
