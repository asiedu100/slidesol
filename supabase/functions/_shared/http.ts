import { corsHeaders } from './cors.ts';

export const jsonResponse = (status: number, body: unknown): Response => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  },
);

export const errorResponse = (status: number, error: string, message: string): Response => jsonResponse(status, { error, message });
