const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const authHeaders = () => ({
  Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''}`,
  'Content-Type': 'application/json',
});

export interface InitializeTransactionParams {
  email: string;
  amountSubunits: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  ok: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference?: string;
  errorMessage?: string;
}

export const initializeTransaction = async (
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> => {
  try {
    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        email: params.email,
        amount: params.amountSubunits,
        currency: params.currency,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      }),
    });

    const body = await response.json();

    if (!response.ok || !body?.status) {
      return { ok: false, errorMessage: body?.message || `Paystack initialize failed (${response.status})` };
    }

    return {
      ok: true,
      authorizationUrl: body.data.authorization_url,
      accessCode: body.data.access_code,
      reference: body.data.reference,
    };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : 'Network error calling Paystack' };
  }
};

export interface VerifyTransactionResult {
  ok: boolean;
  status?: string;
  amountSubunits?: number;
  currency?: string;
  reference?: string;
  paidAt?: string | null;
  errorMessage?: string;
}

export const verifyTransaction = async (reference: string): Promise<VerifyTransactionResult> => {
  try {
    const response = await fetch(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: authHeaders() },
    );

    const body = await response.json();

    if (!response.ok || !body?.status) {
      return { ok: false, errorMessage: body?.message || `Paystack verify failed (${response.status})` };
    }

    return {
      ok: true,
      status: body.data.status,
      amountSubunits: body.data.amount,
      currency: body.data.currency,
      reference: body.data.reference,
      paidAt: body.data.paid_at ?? null,
    };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : 'Network error calling Paystack' };
  }
};

export interface RefundTransactionResult {
  ok: boolean;
  status?: string;
  refundId?: string | number;
  errorMessage?: string;
}

// No `amount` field is sent — omitting it means Paystack refunds the full transaction.
export const refundTransaction = async (transactionReference: string): Promise<RefundTransactionResult> => {
  try {
    const response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ transaction: transactionReference }),
    });

    const body = await response.json();

    if (!response.ok || !body?.status) {
      return { ok: false, errorMessage: body?.message || `Paystack refund failed (${response.status})` };
    }

    return {
      ok: true,
      status: body.data?.status,
      refundId: body.data?.id,
    };
  } catch (error) {
    return { ok: false, errorMessage: error instanceof Error ? error.message : 'Network error calling Paystack' };
  }
};
