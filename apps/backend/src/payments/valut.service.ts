import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ProxyAgent } from 'undici';

const VALUT_BASE_URL = 'https://api.valut.app/openbanking';

/** Erro de rede/timeout - estado UNKNOWN, nao deve refund automatico */
export class ValutNetworkError extends Error {
  constructor(message: string) { super(message); this.name = 'ValutNetworkError'; }
}

/** Erro 4xx do gateway - pagamento rejeitado de forma definitiva, pode refund */
export class ValutRejectedError extends Error {
  constructor(message: string) { super(message); this.name = 'ValutRejectedError'; }
}

function safeProxySummary(proxyUrl: string): string {
  if (!proxyUrl) return 'none';
  try {
    const u = new URL(proxyUrl);
    return `${u.protocol}//${u.hostname}:${u.port || '(default)'}`;
  } catch {
    return 'invalid';
  }
}

function describeFetchError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { raw: String(err) };
  const anyErr = err as Error & {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    cause?: unknown;
  };
  const out: Record<string, unknown> = {
    name: anyErr.name,
    message: anyErr.message,
  };
  if (anyErr.code) out.code = anyErr.code;
  if (anyErr.errno) out.errno = anyErr.errno;
  if (anyErr.syscall) out.syscall = anyErr.syscall;
  if (anyErr.cause) {
    out.cause =
      anyErr.cause instanceof Error
        ? { name: anyErr.cause.name, message: anyErr.cause.message }
        : anyErr.cause;
  }
  return out;
}

@Injectable()
export class ValutService {
  private readonly logger = new Logger(ValutService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private proxyAgent: ProxyAgent | null = null;

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
  private get proxyUrl() {
    return process.env.QUOTAGUARDSTATIC_URL?.trim() ?? '';
  }

  private getDispatcher() {
    if (!this.proxyUrl) return undefined;
    if (!this.proxyAgent) {
      this.proxyAgent = new ProxyAgent(this.proxyUrl);
      this.logger.log(
        `Using QuotaGuard proxy for Valut outbound requests proxy=${safeProxySummary(this.proxyUrl)}`,
      );
    }
    return this.proxyAgent;
  }

  private async authenticate(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken!;
    }

    const basicAuth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString(
      'base64',
    );

    const url = `${VALUT_BASE_URL}/auth`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        dispatcher: this.getDispatcher(),
      } as RequestInit & { dispatcher?: ProxyAgent });
    } catch (err) {
      const details = describeFetchError(err);
      this.logger.error(
        `Valut auth network error url=${url} proxy=${safeProxySummary(
          this.proxyUrl,
        )} details=${JSON.stringify(details)}`,
      );
      throw new ValutNetworkError(
        `Erro de rede no gateway de pagamento (auth): ${
          err instanceof Error ? err.message : 'desconhecido'
        }`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Valut auth failed: ${res.status} ${text}`);
      throw new InternalServerErrorException(
        'Falha na autenticação com gateway de pagamento',
      );
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    // expires_in vem em SEGUNDOS, precisamos converter para timestamp absoluto
    const expiresInSec = Number(data.expires_in) || 3600;
    this.tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000);

    return this.accessToken!;
  }

  private isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiresAt) return false;
    // Considera invalido se vai expirar em menos de 60s
    return this.tokenExpiresAt.getTime() - Date.now() > 60_000;
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

    let res: Response;
    try {
      this.logger.log(
        `Valut request start method=${method} path=${path} url=${url.toString()} proxy=${safeProxySummary(
          this.proxyUrl,
        )}`,
      );
      res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        dispatcher: this.getDispatcher(),
      } as RequestInit & { dispatcher?: ProxyAgent });
    } catch (err) {
      // Network/timeout/connection errors - estado UNKNOWN, NAO refund
      const details = describeFetchError(err);
      this.logger.error(
        `Valut ${method} ${path} network error url=${url.toString()} proxy=${safeProxySummary(
          this.proxyUrl,
        )} details=${JSON.stringify(details)}`,
      );
      throw new ValutNetworkError(
        `Erro de rede no gateway de pagamento: ${
          err instanceof Error ? err.message : 'desconhecido'
        }`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(
        `Valut ${method} ${path} failed: ${res.status} ${text}`,
      );
      // 4xx = rejeicao definitiva; 5xx = pode ter processado, estado incerto
      if (res.status >= 400 && res.status < 500) {
        throw new ValutRejectedError(`Pagamento rejeitado pelo gateway: ${res.status} ${text.slice(0, 200)}`);
      }
      throw new ValutNetworkError(`Falha temporaria no gateway: ${res.status} ${text.slice(0, 200)}`);
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
