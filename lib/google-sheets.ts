// Google Sheets integration helper — reads HR employee data

import { google } from 'googleapis';

export interface SheetEmployee {
    name: string;
    team: string;
}

/**
 * Read employee data from the HR Google Sheet.
 * Expects columns: A = Nama Lengkap, B = Tim
 * 
 * Strategy priority:
 * 1. GOOGLE_API_KEY (if sheet is "Anyone with the link can view")
 * 2. OAuth2 token from a user who connected Google Calendar
 * 3. Direct CSV fetch (if sheet is published to the web)
 */
export async function fetchHRSheetData(): Promise<SheetEmployee[]> {
    const spreadsheetId = process.env.HR_SPREADSHEET_ID;

    if (!spreadsheetId) {
        throw new Error('HR_SPREADSHEET_ID is not configured in environment variables');
    }

    // Strategy 1: Try Google API Key (works if sheet is "Anyone with the link")
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
        try {
            const sheets = google.sheets({ version: 'v4', auth: apiKey });
            return await readSheetData(sheets, spreadsheetId);
        } catch (err: any) {
            console.warn('API Key method failed:', err.message);
        }
    }

    // Strategy 2: Try OAuth2 from a Google-Calendar-connected user
    try {
        const result = await fetchViaOAuth(spreadsheetId);
        if (result) return result;
    } catch (err: any) {
        console.warn('OAuth method failed:', err.message);
    }

    // Strategy 3: Try direct CSV export (works if sheet is "Anyone with the link can view")
    try {
        return await fetchViaCSV(spreadsheetId);
    } catch (err: any) {
        console.warn('CSV method failed:', err.message);
    }

    throw new Error(
        'Unable to read Google Sheet. Please ensure:\n' +
        '1. The sheet is shared as "Anyone with the link can view", OR\n' +
        '2. Set GOOGLE_API_KEY in .env.local, OR\n' +
        '3. A user has connected Google Calendar in the app.'
    );
}

/**
 * Read sheet data via Google Sheets API (used by both API Key and OAuth paths)
 */
async function readSheetData(sheets: any, spreadsheetId: string): Promise<SheetEmployee[]> {
    const sheetName = process.env.HR_SHEET_NAME || 'Sheet1';
    const range = `${sheetName}!A2:B`;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const rows = response.data.values || [];
    return rows
        .filter((row: string[]) => row[0] && row[1])
        .map((row: string[]) => ({
            name: (row[0]).trim(),
            team: (row[1]).trim(),
        }));
}

/**
 * Strategy 2: Use OAuth2 token from a Google-Calendar-connected user
 */
async function fetchViaOAuth(spreadsheetId: string): Promise<SheetEmployee[] | null> {
    const { prisma } = await import('@/lib/db');

    const leaderToken = await prisma.googleToken.findFirst({
        include: { user: { select: { role: true } } },
    });

    if (!leaderToken) return null;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
    );

    oauth2Client.setCredentials({
        access_token: leaderToken.accessToken,
        refresh_token: leaderToken.refreshToken,
        expiry_date: Number(leaderToken.expiryDate ?? 0),
    });

    // Auto-refresh if expired
    if (leaderToken.expiryDate && Date.now() > Number(leaderToken.expiryDate)) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        await prisma.googleToken.update({
            where: { id: leaderToken.id },
            data: {
                accessToken: credentials.access_token || leaderToken.accessToken,
                refreshToken: credentials.refresh_token || leaderToken.refreshToken,
                expiryDate: credentials.expiry_date ? BigInt(credentials.expiry_date) : leaderToken.expiryDate,
                updatedAt: new Date(),
            },
        });
        oauth2Client.setCredentials(credentials);
    }

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    return await readSheetData(sheets, spreadsheetId);
}

/**
 * Strategy 3: Fetch sheet data as CSV via the public export URL.
 * Works if the sheet is shared as "Anyone with the link can view".
 */
async function fetchViaCSV(spreadsheetId: string): Promise<SheetEmployee[]> {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(process.env.HR_SHEET_NAME || 'Sheet1')}`;

    const response = await fetch(url, {
        headers: { 'Accept': 'text/csv' },
    });

    if (!response.ok) {
        throw new Error(`CSV fetch failed with status ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').slice(1); // Skip header row

    return lines
        .map(line => {
            // Parse CSV (handle quoted fields)
            const matches = line.match(/("([^"]*)")|([^,]+)/g);
            if (!matches || matches.length < 2) return null;
            const name = matches[0].replace(/^"|"$/g, '').trim();
            const team = matches[1].replace(/^"|"$/g, '').trim();
            return name && team ? { name, team } : null;
        })
        .filter((e): e is SheetEmployee => e !== null);
}
