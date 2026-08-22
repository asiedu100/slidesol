import { functionUrl } from '../config.js';
import { requireSupabase } from '../supabase.js';

const getAccessToken = async () => {
  const { data: { session } } = await requireSupabase().auth.getSession();
  if (!session) throw new Error('Your session has expired. Please sign in again.');
  return session.access_token;
};

export const createApiClient = (functionName) => {
  const base = functionUrl(functionName);

  const request = async (path, { method = 'GET', body } = {}) => {
    const token = await getAccessToken();

    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.message || `Request failed (${response.status}).`);
    }

    return result;
  };

  const uploadRequest = async (path, formData) => {
    const token = await getAccessToken();

    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(result?.message || `Upload failed (${response.status}).`);
    }

    return result;
  };

  return { request, uploadRequest };
};
