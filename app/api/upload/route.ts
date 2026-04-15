import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

// Use GCS if available, otherwise fall back to base64 data URL
async function uploadToGCS(buffer: Buffer, filename: string, contentType: string): Promise<string | null> {
    try {
        const storage = new Storage();
        const bucketName = process.env.GCS_BUCKET_NAME;
        if (!bucketName) return null;

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
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > 25 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Maximum size is 25MB.' }, { status: 400 });
        }

        const ext = file.name?.split('.').pop() || 'png';
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Try GCS first
        const gcsUrl = await uploadToGCS(buffer, filename, file.type);
        if (gcsUrl) {
            return NextResponse.json({ url: gcsUrl }, { status: 200 });
        }

        // Fallback: convert to base64 data URL (works everywhere, no storage needed)
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${file.type};base64,${base64}`;

        return NextResponse.json({ url: dataUrl }, { status: 200 });
    } catch (err: any) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
