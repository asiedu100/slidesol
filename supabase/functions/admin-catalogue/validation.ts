export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HEX_COLOUR_RE = /^#[0-9a-f]{6}$/i;

export const isNonEmptyString = (value: unknown, maxLength = 255): value is string => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
);

export const isOptionalString = (value: unknown, maxLength = 255): boolean => (
  value === null || value === undefined || value === ''
    || (typeof value === 'string' && value.length <= maxLength)
);

export const isFiniteNonNegativeNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export const parseJsonBody = async (req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> => {
  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false };
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
};
