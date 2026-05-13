import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-server';

// GET — Members of a team. When ?channelId is given, filter to only those who
// can see the channel (matches the channel-visibility rules used elsewhere).
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await requireAuth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    const team = await prisma.team.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            mentionHandle: true,
            users: {
                where: { accountStatus: 'active' },
                select: { id: true, name: true, email: true, image: true, role: true, teamId: true },
                orderBy: { name: 'asc' },
            },
        },
    });
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    let members = team.users;

    // Restrict to users who can see the channel — same rules used by /api/channels.
    if (channelId) {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            select: {
                isPrivate: true,
                createdBy: true,
                visibleToAllTeams: true,
                allowedTeamIds: true,
                members: { select: { userId: true } },
            },
        });
        if (channel) {
            const explicitMembers = new Set(channel.members.map(m => m.userId));
            if (channel.createdBy) explicitMembers.add(channel.createdBy);
            members = members.filter(u => {
                if (channel.isPrivate) return explicitMembers.has(u.id);
                if (channel.visibleToAllTeams) return true;
                if (u.teamId && channel.allowedTeamIds.includes(u.teamId)) return true;
                return explicitMembers.has(u.id);
            });
        }
    }

    return NextResponse.json({
        team: { id: team.id, name: team.name, mentionHandle: team.mentionHandle },
        members: members.map(u => ({ id: u.id, name: u.name, email: u.email, image: u.image, role: u.role })),
    });
}
