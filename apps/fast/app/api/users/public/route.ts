import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET — Fetch all users for public dropdowns (id + name + team only).
//
// Reached without a session cookie from the public /request page (assignee
// dropdown and meeting-invite multi-select). The two call sites in
// app/request/page.tsx only read { id, name, teams }; the email field the
// route was selecting was never consumed by any client, so it's dropped
// here to keep the public surface free of employee PII. If a future caller
// genuinely needs email-disambiguation, add a separate authed endpoint
// rather than reopening this one.
export async function GET() {
    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            team: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
    });

    const data = users.map(u => ({
        id: u.id,
        name: u.name,
        teams: u.team ? { name: u.team.name } : null,
    }));

    return NextResponse.json(data);
}
