import { NextRequest, NextResponse } from 'next/server';
import { fetchHRSheetData } from '@/lib/google-sheets';

// Map short team names from Google Sheet → division names used in the app
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

// Simple in-memory cache (refreshes every 5 minutes)
let cachedData: { names: { name: string; division: string }[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET — Public endpoint to fetch employee names (optionally filtered by division)
export async function GET(request: NextRequest) {
    const division = request.nextUrl.searchParams.get('division');

    try {
        // Check cache
        if (!cachedData || Date.now() - cachedData.fetchedAt > CACHE_TTL) {
            const employees = await fetchHRSheetData();
            cachedData = {
                names: employees.map(e => ({
                    name: e.name,
                    division: resolveTeamName(e.team),
                })),
                fetchedAt: Date.now(),
            };
        }

        let results = cachedData.names;

        // Filter by division if provided
        if (division) {
            results = results.filter(e => e.division === division);
        }

        // Sort alphabetically
        results.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json(results);
    } catch (err: any) {
        console.error('Employee list error:', err.message);
        return NextResponse.json([], { status: 200 }); // Return empty array on error so UI doesn't break
    }
}
