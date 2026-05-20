import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireFastAuth } from '@/lib/auth/require-fast-auth';
import { fetchHRSheetData, SheetEmployee } from '@/lib/google-sheets';

// Normalize names for fuzzy matching (lowercase, trim extra spaces)
function normalize(name: string): string {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Map common short team names from Google Sheet → DB team names
const TEAM_NAME_MAP: Record<string, string> = {
    'executives': 'Executives',
    'fbi': 'Factual Business Intelligence (FBI)',
    'cs': 'Customer Service (CS)',
    'marketplace': 'Marketplace (MP)',
    'branding': 'Branding',
    'hrd': 'Human Resource (HR)',
    'hr': 'Human Resource (HR)',
    'partnership': 'Partner Relationship (PR)',
    'logistics': 'Logistics',
    'warehouse': 'Warehouse',
    'finance': 'Finance',
    'leadership': 'Leadership',
    'bd': 'Business Development (BD)',
    'business development': 'Business Development (BD)',
};

function resolveTeamName(sheetTeamName: string): string {
    const lower = sheetTeamName.toLowerCase().trim();
    return TEAM_NAME_MAP[lower] || sheetTeamName.trim();
}

// POST — Sync HR data from Google Sheets
export async function POST() {
    // Verify leader/admin access
    const session = await requireFastAuth();
    if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
    });

    if (user?.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized — Master access required' }, { status: 403 });
    }

    try {
        // 1. Fetch data from Google Sheets
        const employees: SheetEmployee[] = await fetchHRSheetData();

        if (employees.length === 0) {
            return NextResponse.json({
                status: 'warning',
                message: 'No employee data found in the Google Sheet.',
                stats: { totalRows: 0, teamsCreated: 0, usersUpdated: 0, unmatched: [] },
            });
        }

        // 2. Get all existing teams from DB — project only id + name (T1.17 Medium fix).
        const existingTeams = await prisma.team.findMany({
            select: { id: true, name: true },
        });
        const teamByName = new Map<string, { id: string; name: string }>(
            existingTeams.map(t => [t.name.toLowerCase(), t])
        );

        // 3. Get all existing users from DB
        const existingUsers = await prisma.user.findMany({
            select: { id: true, name: true, teamId: true },
        });
        const userByNormalizedName = new Map<string, { id: string; name: string; teamId: string | null }>(
            existingUsers.map(u => [normalize(u.name), u as { id: string; name: string; teamId: string | null }])
        );

        // Track statistics
        let teamsCreated = 0;
        let usersUpdated = 0;
        const unmatchedEmployees: string[] = [];

        // 4. Ensure all teams from the sheet exist in DB — single create per
        //    missing team (sequential is fine; team count is bounded and small).
        const uniqueTeamNames = [...new Set(employees.map(e => resolveTeamName(e.team)))];
        for (const teamName of uniqueTeamNames) {
            if (!teamByName.has(teamName.toLowerCase())) {
                const newTeam = await prisma.team.create({
                    data: { name: teamName },
                    select: { id: true, name: true },
                });
                teamByName.set(teamName.toLowerCase(), newTeam);
                teamsCreated++;
            }
        }

        // 5. Match employees to users and collect team-change updates.
        // Batch all user.update calls into a single updateMany per target teamId
        // instead of one UPDATE per employee (N+1 fix, T1.15b).
        // Per-employee payloads only diverge on teamId, so grouping by teamId
        // lets us use updateMany({ where: { id: { in: ids } }, data: { teamId } }).
        const updatesByTeam = new Map<string, string[]>(); // teamId → userIds

        for (const emp of employees) {
            const resolvedTeam = resolveTeamName(emp.team);
            const team = teamByName.get(resolvedTeam.toLowerCase());
            if (!team) continue;

            const normalizedName = normalize(emp.name);
            const matchedUser = userByNormalizedName.get(normalizedName);

            if (matchedUser) {
                // Only update if team changed.
                if (matchedUser.teamId !== team.id) {
                    const bucket = updatesByTeam.get(team.id) ?? [];
                    bucket.push(matchedUser.id);
                    updatesByTeam.set(team.id, bucket);
                }
            } else {
                unmatchedEmployees.push(emp.name);
            }
        }

        // Issue one updateMany per distinct target teamId.
        for (const [teamId, userIds] of updatesByTeam) {
            await prisma.user.updateMany({
                where: { id: { in: userIds } },
                data: { teamId },
            });
            usersUpdated += userIds.length;
        }

        return NextResponse.json({
            status: 'success',
            message: `Sync complete. ${usersUpdated} user(s) updated, ${teamsCreated} new team(s) created.`,
            stats: {
                totalRows: employees.length,
                teamsCreated,
                usersUpdated,
                unmatched: unmatchedEmployees,
            },
        });
    } catch (err: any) {
        console.error('HR Sync error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to sync HR data' },
            { status: 500 }
        );
    }
}
