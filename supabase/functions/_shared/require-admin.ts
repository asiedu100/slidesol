import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createAdminClient } from './supabase-admin.ts';
import { errorResponse } from './http.ts';
import { ADMIN_ROLE } from './constants.ts';

export interface AdminProfile {
  id: string;
  full_name: string | null;
  role: string;
}

export type VerifyAdminResult =
  | { authorized: true; profile: AdminProfile; supabase: SupabaseClient }
  | {
    authorized: false;
    reason: 'missing_token' | 'invalid_token' | 'server_error' | 'forbidden';
    response: Response;
  };

export const verifyAdminRequest = async (req: Request): Promise<VerifyAdminResult> => {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return {
      authorized: false,
      reason: 'missing_token',
      response: errorResponse(401, 'missing_token', 'Missing bearer token.'),
    };
  }

  const supabase = createAdminClient();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      authorized: false,
      reason: 'invalid_token',
      response: errorResponse(401, 'invalid_token', 'Session is invalid or expired.'),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('require-admin: profile lookup failed', profileError);
    return {
      authorized: false,
      reason: 'server_error',
      response: errorResponse(500, 'server_error', 'Could not verify admin access.'),
    };
  }

  if (!profile || !profile.is_active || profile.role !== ADMIN_ROLE) {
    return {
      authorized: false,
      reason: 'forbidden',
      response: errorResponse(403, 'forbidden', 'This account does not have studio access.'),
    };
  }

  return {
    authorized: true,
    profile: { id: profile.id, full_name: profile.full_name, role: profile.role },
    supabase,
  };
};
