// Fix RLS infinite recursion by creating a security definer function
// and replacing the recursive policies on the users table.
// This script uses the Supabase Management API.

const SUPABASE_URL = 'https://iyhedrjbgoskuwlrrfph.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aGVkcmpiZ29za3V3bHJyZnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODkwMTY2MywiZXhwIjoyMDg0NDc3NjYzfQ.rNmptXnPImXCE-ZS0ucIze7qzpKpuJd2rNQDgAjLse8';

const PROJECT_REF = 'iyhedrjbgoskuwlrrfph';

const SQL = `
-- Step 1: Create a security definer function to get team_id without triggering RLS
CREATE OR REPLACE FUNCTION get_my_team_id()
RETURNS UUID AS $$
    SELECT team_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Step 2: Drop all problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Users can view team members" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can view their team" ON teams;
DROP POLICY IF EXISTS "Users can view team projects" ON projects;
DROP POLICY IF EXISTS "Leaders can manage projects" ON projects;
DROP POLICY IF EXISTS "Users can view team tasks" ON tasks;
DROP POLICY IF EXISTS "Members can update their assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Leaders can manage tasks" ON tasks;

-- Step 3: Recreate users policies (non-recursive)
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can view team members" ON users
    FOR SELECT USING (team_id = get_my_team_id());

-- Step 4: Recreate teams policy (uses function instead of subquery)
CREATE POLICY "Users can view their team" ON teams
    FOR SELECT USING (id = get_my_team_id());

-- Step 5: Recreate projects policies (uses function instead of subquery)
CREATE POLICY "Users can view team projects" ON projects
    FOR SELECT USING (team_id = get_my_team_id());

CREATE POLICY "Leaders can manage projects" ON projects
    FOR ALL USING (
        team_id = get_my_team_id()
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'leader'
    );

-- Step 6: Recreate tasks policies (uses function instead of subquery)  
CREATE POLICY "Users can view team tasks" ON tasks
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects WHERE team_id = get_my_team_id()
        )
    );

CREATE POLICY "Members can update their assigned tasks" ON tasks
    FOR UPDATE USING (
        assignee_id = auth.uid()
        OR project_id IN (
            SELECT id FROM projects WHERE team_id = get_my_team_id()
            AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'leader'
        )
    );

CREATE POLICY "Leaders can manage tasks" ON tasks
    FOR ALL USING (
        project_id IN (
            SELECT id FROM projects WHERE team_id = get_my_team_id()
            AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'leader'
        )
    );
`;

async function main() {
    console.log('Attempting to fix RLS policies via Supabase Management API...');
    
    // Try the Supabase Management API (requires access token, not service role)
    // Let's try with service role key as bearer token on the SQL endpoint
    const endpoints = [
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
        `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    ];

    for (const endpoint of endpoints) {
        console.log(`\nTrying endpoint: ${endpoint}`);
        try {
            const r = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ query: SQL }),
            });
            const status = r.status;
            const text = await r.text();
            console.log(`  Status: ${status}`);
            console.log(`  Response: ${text.substring(0, 500)}`);
            
            if (status >= 200 && status < 300) {
                console.log('\n✅ SUCCESS! RLS policies have been fixed.');
                return;
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }

    console.log('\n❌ Could not run SQL via API. Please run the following SQL in your Supabase SQL Editor:');
    console.log('   Go to: https://supabase.com/dashboard/project/iyhedrjbgoskuwlrrfph/sql/new');
    console.log(SQL);
}

main().catch(console.error);
