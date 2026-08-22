import { createClient } from 'npm:@supabase/supabase-js@2';

// Service-role client — bypasses RLS. This is intentional and safe here: these Edge
// Functions run server-side only, the service role key is never sent to the browser,
// and every write below is preceded by this function's own server-side validation.
export const createAdminClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);
