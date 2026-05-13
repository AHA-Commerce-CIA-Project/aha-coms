import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/db';

export async function GET() {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        // Get Cloud SQL database size
        const dbSizeResult = await prisma.$queryRaw<{ size: string }[]>`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `;
        const dbSizeRawResult = await prisma.$queryRaw<{ size_bytes: bigint }[]>`
            SELECT pg_database_size(current_database()) as size_bytes
        `;

        const dbSizeBytes = Number(dbSizeRawResult[0]?.size_bytes ?? 0);
        const dbSizePretty = dbSizeResult[0]?.size ?? '0 MB';

        // Cloud SQL db-f1-micro has 10 GB storage
        const totalStorageGB = 10;
        const totalStorageBytes = totalStorageGB * 1024 * 1024 * 1024;
        const usedGB = parseFloat((dbSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
        const availableGB = parseFloat((totalStorageGB - usedGB).toFixed(2));
        const usagePercent = parseFloat(((dbSizeBytes / totalStorageBytes) * 100).toFixed(1));

        return NextResponse.json({
            database: {
                used: dbSizePretty,
                usedGB,
                totalGB: totalStorageGB,
                availableGB,
                usagePercent,
            },
        });
    } catch (err: any) {
        console.error('Storage API error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch storage info' }, { status: 500 });
    }
}
