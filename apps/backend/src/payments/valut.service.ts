import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

const VALUT_BASE_URL = 'https://api.valut.app/openbanking';

@Injectable()
export class ValutService {
  private readonly logger = new Logger(ValutService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  private get apiKey() {
    return process.env.VALUT_API_KEY ?? '';
  }
  private get apiSecret() {
    return process.env.VALUT_API_SECRET ?? '';
  }
  private get username() {
    return process.env.VALUT_USERNAME ?? '';
  }
  private get password() {
    return process.env.VALUT_PASSWORD ?? '';
  }

  private async authenticate(): Promise<string> {
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      new Date() < this.tokenExpiresAt
    ) {
      return this.accessToken;
    }

    const basicAuth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString(
      'base64',
    );

    const res = await fetch(`${VALUT_BASE_URL}/auth`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Valut auth failed: ${res.status} ${text}`);
      throw new InternalServerErrorException(
        'Falha na autenticação com gateway de pagamento',
      );
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(data.expires_in);

    // Refresh 5 minutes before expiry
    const expiresMs = this.tokenExpiresAt.getTime() - Date.now() - 5 * 60_000;
    if (expiresMs > 0) {
      setTimeout(() => {
        this.accessToken = null;
        this.tokenExpiresAt = null;
      }, expiresMs);
    }

    return this.accessToken!;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const token = await this.authenticate();
    const url = new URL(`${VALUT_BASE_URL}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(
        `Valut ${method} ${path} failed: ${res.status} ${text}`,
      );
      throw new InternalServerErrorException(
        `Falha no gateway de pagamento: ${res.status}`,
      );
    }

    return res.json() as Promise<T>;
  }

  /**
   * Create a PIX QR Code for cashin (deposit).
   * Amount in centavos. Returns pix_id, qrcode (copia e cola), base64 image, etc.
   */
  async createPixQrCode(params: {
    amountCents: number;
    externalId: string;
    documentValidation: string;
    idempotencyKey: string;
  }) {
    return this.request<{
      pix_id: string;
      type: string;
      paid: boolean;
      base64: string | null;
      qrcode: string;
      amount: number;
      expiration_date: string;
      created_at: string;
    }>(
      'POST',
      '/pix/qrcode',
      {
        amount: params.amountCents,
        type: 'dynamic',
        external_id: params.externalId,
        expiration_date: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
        document_validation: params.documentValidation,
        Idempotency: params.idempotencyKey,
      },
      { withImage: 'true' },
    );
  }

  /**
   * Check QR Code status (paid, processing, etc.)
   */
  async getPixQrCode(pixQrCodeId: string) {
    return this.request<{
      pix_id: string;
      paid: boolean;
      status: string;
      amount: number;
      qrcode: string;
      base64: string | null;
      expiration_date: string;
      created_at: string;
      endToEndId?: string;
      is_refunded?: boolean;
    }>('GET', `/pix/qrcode/${pixQrCodeId}`);
  }

  /**
   * Perform PIX cashout (withdrawal).
   * Amount in centavos.
   */
  async performPixCashout(params: {
    amountCents: number;
    keyType: 'document' | 'phone' | 'email' | 'evp';
    key: string;
    externalId: string;
    documentValidation: string;
    idempotencyKey: string;
  }) {
    return this.request<{
      pix_id: string;
      endToEndId: string;
      amount: number;
      tax_amount: number;
      status: string;
      created_at: string;
      external_id: string;
      receiver: {
        ispb: string;
        bank_name: string;
        branch: string;
        account_number: string;
        account_type: string;
        document: string;
        document_type: string;
        name: string;
        trade_name: string;
      };
    }>('POST', '/pix/payments', {
      amount: params.amountCents,
      key_type: params.keyType,
      key: params.key,
      external_id: params.externalId,
      document_validation: params.documentValidation,
      Idempotency: params.idempotencyKey,
    });
  }

  /**
   * Get PIX cashout status.
   */
  async getPixCashout(pixId: string) {
    return this.request<{
      pix_id: string;
      amount: number;
      tax_amount: number;
      status: string;
      created_at: string;
      endtoend: string;
      receiver: Record<string, string>;
    }>('GET', `/pix/payments/${pixId}/`);
  }
}
