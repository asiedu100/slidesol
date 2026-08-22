import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const slugify = (input: string): string => input
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 200);

// Slug generation is always server-authoritative, even when the client sends a slug of
// its own — a client-side copy of slugify() is fine for a live preview, never for the
// value that actually gets written.
export const generateUniqueSlug = async (
  supabase: SupabaseClient,
  table: 'brands' | 'products',
  desired: string,
  excludeId?: string,
): Promise<string> => {
  const base = slugify(desired) || 'item';
  let candidate = base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    let query = supabase.from(table).select('id').eq('slug', candidate);
    if (excludeId) query = query.neq('id', excludeId);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return candidate;

    candidate = `${base}-${suffix}`;
  }

  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
};
