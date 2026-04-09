import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Only PNG, JPEG, WebP, and GIF are allowed.' }, { status: 400 });
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
        }

        const ext = file.name?.split('.').pop() || 'png';
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'images');
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, filename);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));

        const url = `/uploads/images/${filename}`;

        return NextResponse.json({ url }, { status: 200 });
    } catch (err: any) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
