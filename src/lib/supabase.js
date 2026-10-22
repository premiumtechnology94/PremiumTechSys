import { createClient } from '@supabase/supabase-js';

// Esto le dice a React que lea las variables secretas que pusimos en Vercel
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);