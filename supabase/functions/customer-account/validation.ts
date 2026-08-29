// Small, self-contained validation helpers — deliberately duplicated from
// admin-catalogue/validation.ts rather than imported across function directories.
// Each Edge Function is bundled independently at deploy time (function dir + _shared/
// only), so reaching into a sibling function's directory is not a safe cross-import.

export const isNonEmptyString = (value: unknown, maxLength = 255): value is string => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
);

export const isOptionalString = (value: unknown, maxLength = 255): boolean => (
  value === null || value === undefined || value === ''
    || (typeof value === 'string' && value.length <= maxLength)
);

export const parseJsonBody = async (req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> => {
  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
};
