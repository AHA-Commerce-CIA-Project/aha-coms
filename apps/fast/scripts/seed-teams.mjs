import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyhedrjbgoskuwlrrfph.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aGVkcmpiZ29za3V3bHJyZnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODkwMTY2MywiZXhwIjoyMDg0NDc3NjYzfQ.rNmptXnPImXCE-ZS0ucIze7qzpKpuJd2rNQDgAjLse8';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const teams = [
    'Factual Business Intelligence (FBI)',
    'Partner Relationship (PR)',
    'Marketplace (MP)',
    'Branding',
    'Finance',
    'Business Development (BD)',
    'Warehouse',
    'Human Resource (HR)',
    'Customer Service (CS)',
    'Logistics',
];

async function seed() {
    // First check existing teams
    const { data: existing } = await supabase.from('teams').select('name');
    const existingNames = new Set((existing || []).map(t => t.name));

    const toInsert = teams
        .filter(name => !existingNames.has(name))
        .map(name => ({ name }));

    if (toInsert.length === 0) {
        console.log('All teams already exist!');
    } else {
        const { data, error } = await supabase.from('teams').insert(toInsert).select();
        if (error) {
            console.error('Error inserting teams:', error.message);
        } else {
            console.log(`Inserted ${data.length} teams:`, data.map(t => t.name).join(', '));
        }
    }

    // Show all teams
    const { data: all } = await supabase.from('teams').select('id, name').order('name');
    console.log('\nAll teams in database:');
    all?.forEach(t => console.log(`  - ${t.name} (${t.id})`));
}

seed().catch(console.error);
