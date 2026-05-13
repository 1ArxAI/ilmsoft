import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('students')
    .select('id, parent:parents(first_name, last_name)')
    .limit(1);
  console.log(JSON.stringify({ data, error }));
}
test();
