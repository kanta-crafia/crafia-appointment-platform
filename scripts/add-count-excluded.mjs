import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Check if column already exists by trying to select it
const { data, error } = await supabase.from('projects').select('is_count_excluded').limit(1);
if (!error) {
  console.log('Column is_count_excluded already exists');
  process.exit(0);
}

console.log('Column does not exist yet, need to add via Supabase Dashboard SQL editor');
console.log('Run this SQL: ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_count_excluded boolean DEFAULT false;');
process.exit(1);
