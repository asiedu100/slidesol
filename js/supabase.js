import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config.js';

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;

export const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add your project URL and anon key in js/config.js.');
  }

  return supabase;
};
