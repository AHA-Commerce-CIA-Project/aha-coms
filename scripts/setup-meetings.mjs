import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing SUPABASE env vars in .env.local');
    process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function setup() {
    console.log('Creating meetings table...');

    // Create the meetings table via SQL
    const { error } = await admin.rpc('exec_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS meetings (
                id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                title text NOT NULL,
                description text,
                meeting_date date NOT NULL,
                start_time time NOT NULL,
                end_time time NOT NULL,
                created_by uuid REFERENCES users(id) ON DELETE SET NULL,
                assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
                source text NOT NULL DEFAULT 'member' CHECK (source IN ('leader', 'partner_relations', 'member')),
                status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
                created_at timestamptz DEFAULT now()
            );

            ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

            -- Allow all operations via service role (RLS bypass)
            CREATE POLICY IF NOT EXISTS "Allow all for service role" ON meetings
                FOR ALL USING (true) WITH CHECK (true);
        `
    });

    if (error) {
        // The rpc might not exist; try raw SQL via REST
        console.log('RPC not available, trying direct approach...');
        console.log('');
        console.log('Please run this SQL in the Supabase SQL Editor:');
        console.log('=============================================');
        console.log(`
CREATE TABLE IF NOT EXISTS meetings (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    meeting_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
    source text NOT NULL DEFAULT 'member' CHECK (source IN ('leader', 'partner_relations', 'member')),
    status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
    created_at timestamptz DEFAULT now()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON meetings
    FOR ALL USING (true) WITH CHECK (true);
        `);
        console.log('=============================================');
    } else {
        console.log('✅ Meetings table created successfully!');
    }
}

setup();
