import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente da API oficial do Listas Brasil (somente leitura, server-to-server).
 * Contrato em /api-v1 (README/pilots/events). Base canônica é o host `www`
 * (o sem-www responde 308 e derruba o header de auth num fetch ingênuo).
 */
const BASE_URL = 'https://www.listasbrasil.com/api/v1';

export type ApiV1Pilot = {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  region: string | null;
  area: string | null;
  oficina: string | null;
  listaId: string;
  listaName: string;
  carModel: string | null;
  category: string | null;
  carImageUrl: string | null;
  car: { modelo?: string; fabricante?: string } | null;
  teamInfo: { name?: string } | null;
  listPosition: number;
  isActive: boolean;
  updatedAt: string;
};

export type ApiV1Event = {
  id: string;
  name: string;
  type: 'rodada' | 'leva_tudo' | 'armageddon' | 'desafio';
  listaId: string | null;
  listaName: string;
  date: string;
  dateEnd: string | null;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  description: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  updatedAt: string;
};

type Envelope<T> = {
  data: { items: T[] };
  meta: { nextCursor: string | null; hasMore?: boolean };
};

export class ListasBrasilConfigError extends Error {}

@Injectable()
export class ListasBrasilApiClient {
  private readonly logger = new Logger(ListasBrasilApiClient.name);

  private get apiKey(): string {
    const key = process.env.LISTAS_BRASIL_API_KEY?.trim();
    if (!key) {
      throw new ListasBrasilConfigError(
        'LISTAS_BRASIL_API_KEY não configurado — defina a chave no ambiente.',
      );
    }
    return key;
  }

  isConfigured(): boolean {
    return !!process.env.LISTAS_BRASIL_API_KEY?.trim();
  }

  /** Percorre TODAS as páginas de um recurso, chamando `onItems` por página. */
  async readAll<T>(
    resource: 'pilots' | 'events',
    onItems: (items: T[]) => Promise<void>,
    filters: Record<string, string> = {},
  ): Promise<number> {
    let cursor: string | null = null;
    let total = 0;
    let guard = 0;
    do {
      if (guard++ > 500) throw new Error('Paginação excedeu o limite de segurança (500 páginas).');
      const url = new URL(`${BASE_URL}/${resource}`);
      url.searchParams.set('limit', '100');
      for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
      if (cursor) url.searchParams.set('cursor', cursor);

      const page = await this.fetchJson<Envelope<T>>(url.toString());
      const items = page.data?.items ?? [];
      total += items.length;
      if (items.length) await onItems(items);
      cursor = page.meta?.nextCursor ?? null;
    } while (cursor);
    return total;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow', // www redirect é mesmo host efetivo; mantém auth
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'Accept-Language': 'pt-BR',
        },
      });
    } catch (err) {
      throw new Error(`Falha de rede ao chamar Listas Brasil: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let code = '';
      try { code = (JSON.parse(text)?.error?.code as string) ?? ''; } catch { /* ignore */ }
      throw new Error(`Listas Brasil ${res.status}${code ? ` (${code})` : ''}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  }
}
