import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createAdminClient } from './supabase-admin.ts';
import { errorResponse } from './http.ts';

export interface CustomerProfile {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
}

export type VerifyCustomerResult =
  | { authorized: true; customer: CustomerProfile; supabase: SupabaseClient }
  | {
    authorized: false;
    reason: 'missing_token' | 'invalid_token' | 'server_error';
    response: Response;
  };

const CUSTOMER_SELECT = 'id, full_name, phone, email';

// The one "resolve or create" path every customer-facing request goes through. A
// customers row already exists for anyone who has ever checked out as a guest — this
// links THIS auth account to that same row by phone, rather than creating a duplicate,
// which is what makes past guest orders show up in an account's order history the
// moment someone signs up with the phone number they already ordered with.
export const verifyCustomerRequest = async (req: Request): Promise<VerifyCustomerResult> => {
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

  const authUser = userData.user;

  const { data: existing, error: existingError } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (existingError) {
    console.error('require-customer: lookup by auth_user_id failed', existingError);
    return { authorized: false, reason: 'server_error', response: errorResponse(500, 'server_error', 'Could not verify your account.') };
  }

  if (existing) {
    return { authorized: true, customer: existing, supabase };
  }

  // First request from a brand-new signup — full_name/phone travel in from
  // supabase.auth.signUp's options.data, never trusted beyond this first linking.
  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim() : 'Customer';
  const phone = typeof meta.phone === 'string' ? meta.phone.trim() : '';

  if (phone) {
    const { data: guestMatch, error: guestError } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('phone', phone)
      .is('auth_user_id', null)
      .maybeSingle();

    if (guestError) {
      console.error('require-customer: guest lookup failed', guestError);
      return { authorized: false, reason: 'server_error', response: errorResponse(500, 'server_error', 'Could not verify your account.') };
    }

    if (guestMatch) {
      const { data: linked, error: linkError } = await supabase
        .from('customers')
        .update({ auth_user_id: authUser.id })
        .eq('id', guestMatch.id)
        .select(CUSTOMER_SELECT)
        .single();

      if (linkError || !linked) {
        console.error('require-customer: linking guest customer failed', linkError);
        return { authorized: false, reason: 'server_error', response: errorResponse(500, 'server_error', 'Could not verify your account.') };
      }
      return { authorized: true, customer: linked, supabase };
    }
  }

  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert({
      auth_user_id: authUser.id,
      full_name: fullName,
      phone: phone || `pending-${authUser.id.slice(0, 8)}`,
      email: authUser.email ?? null,
    })
    .select(CUSTOMER_SELECT)
    .single();

  if (createError || !created) {
    console.error('require-customer: creating customer failed', createError);
    return { authorized: false, reason: 'server_error', response: errorResponse(500, 'server_error', 'Could not set up your account.') };
  }

  return { authorized: true, customer: created, supabase };
};

// A softer variant for create-order: a missing/invalid/anon-key token is not an error
// there — it just means a guest checkout, so the existing phone-match-or-create flow
// runs unchanged. Only a genuinely valid customer session returns a customer.
export const tryResolveCustomer = async (req: Request): Promise<CustomerProfile | null> => {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const supabase = createAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: existing } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  return existing ?? null;
};
