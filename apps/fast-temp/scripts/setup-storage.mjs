// Setup Supabase Storage bucket and add image_url column to tasks table
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function setup() {
    console.log('🚀 Setting up Supabase Storage and schema...\n');

    // 1. Create storage bucket
    console.log('📦 Creating "request-attachments" storage bucket...');
    const { data: bucket, error: bucketError } = await supabase.storage.createBucket('request-attachments', {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024, // 5MB limit
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    });

    if (bucketError) {
        if (bucketError.message?.includes('already exists')) {
            console.log('   ✅ Bucket already exists, skipping.\n');
        } else {
            console.error('   ❌ Error creating bucket:', bucketError.message);
        }
    } else {
        console.log('   ✅ Bucket created successfully.\n');
    }

    // 2. Add image_url column to tasks table
    console.log('🗃️  Adding "image_url" column to tasks table...');
    const { error: colError } = await supabase.rpc('exec_sql', {
        query: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url TEXT;`
    }).single();

    if (colError) {
        // Try direct SQL via REST if rpc doesn't work
        console.log('   ⚠️  RPC not available, trying direct SQL...');
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceRoleKey,
                'Authorization': `Bearer ${supabaseServiceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url TEXT;` }),
        });

        if (!res.ok) {
            console.log('   ⚠️  Could not add column via RPC. Please run this SQL manually in Supabase SQL Editor:');
            console.log('   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url TEXT;');
        } else {
            console.log('   ✅ Column added successfully.\n');
        }
    } else {
        console.log('   ✅ Column added successfully.\n');
    }

    console.log('✅ Setup complete!');
    console.log('\nIf the column was not added automatically, please run this in the Supabase SQL Editor:');
    console.log('  ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url TEXT;');
}

setup().catch(console.error);
