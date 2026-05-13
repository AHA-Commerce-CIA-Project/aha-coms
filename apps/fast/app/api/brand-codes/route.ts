import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// Cache brand codes for 10 minutes
let cachedCodes: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

// GET — Fetch brand codes from Google Sheets "Daftar Brand" tab, column B ("Kode")
export async function GET() {
    // Return cache if fresh
    if (cachedCodes && Date.now() - cachedAt < CACHE_TTL) {
        return NextResponse.json(cachedCodes);
    }

    const spreadsheetId = process.env.HR_SPREADSHEET_ID;
    if (!spreadsheetId) {
        return NextResponse.json([], { status: 200 });
    }

    try {
        // Try with OAuth token from a connected user
        const { prisma } = await import('@/lib/db');
        const token = await prisma.googleToken.findFirst({
            select: { accessToken: true, refreshToken: true, expiryDate: true },
        });

        let sheets;
        if (token) {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
            );
            oauth2Client.setCredentials({
                access_token: token.accessToken,
                refresh_token: token.refreshToken,
                expiry_date: Number(token.expiryDate ?? 0),
            });

            // Refresh if expired
            if (token.expiryDate && Date.now() > Number(token.expiryDate)) {
                const { credentials } = await oauth2Client.refreshAccessToken();
                oauth2Client.setCredentials(credentials);
            }

            sheets = google.sheets({ version: 'v4', auth: oauth2Client });
        } else {
            // Try API key
            const apiKey = process.env.GOOGLE_API_KEY;
            if (apiKey) {
                sheets = google.sheets({ version: 'v4', auth: apiKey });
            }
        }

        if (!sheets) {
            console.warn('No auth available for Google Sheets');
            return NextResponse.json([]);
        }

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Daftar Brand!B3:B',
        });

        const rows = res.data.values || [];
        const codes = rows
            .map(row => (row[0] || '').trim())
            .filter(code => code.length > 0);

        // Cache
        cachedCodes = codes;
        cachedAt = Date.now();

        return NextResponse.json(codes);
    } catch (err: any) {
        console.error('Brand codes fetch error:', err.message);

        // Try CSV fallback
        try {
            const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Daftar Brand')}`;
            const csvRes = await fetch(csvUrl);
            if (csvRes.ok) {
                const text = await csvRes.text();
                // Skip 2 header rows: row 1 "Daftar Brand Dalam Portfolio..." and row 2 "Nama Brand | Kode"
                const lines = text.split('\n').slice(2);
                const codes = lines
                    .map(line => {
                        const cols = line.match(/("([^"]*)")|([^,]+)/g);
                        return cols && cols[1] ? cols[1].replace(/^"|"$/g, '').trim() : '';
                    })
                    .filter(code => code.length > 0);

                cachedCodes = codes;
                cachedAt = Date.now();
                return NextResponse.json(codes);
            }
        } catch {}

        return NextResponse.json([]);
    }
}
