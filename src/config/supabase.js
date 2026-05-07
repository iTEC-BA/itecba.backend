import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[SUPABASE] Variables de entorno no definidas: SUPABASE_URL / SUPABASE_SERVICE_KEY');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
