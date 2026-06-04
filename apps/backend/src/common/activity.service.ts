import { Injectable } from '@nestjs/common';

/**
 * Sinal central de "a plataforma está sendo usada agora?".
 *
 * Serve para os tickers de fundo (refresh de mercado, lifecycle de eventos)
 * PAUSAREM o acesso ao banco quando não há ninguém ativo — assim a Neon
 * (Postgres serverless) consegue hibernar (scale-to-zero) e parar de cobrar CU
 * quando não há usuários. Qualquer atividade reativa na hora.
 *
 * "Ativo" = existe cliente WebSocket conectado OU houve request HTTP recente.
 * NÃO controla o reconcile de pagamentos — esse roda enquanto houver pagamento
 * pendente (rede de segurança do crédito de depósito), independente disto.
 */
@Injectable()
export class ActivityService {
  private lastHttpAt = Date.now();
  private wsClients = 0;
  // Janela de "atividade HTTP recente". Após isso sem request e sem cliente WS,
  // os tickers pausam e a Neon pode hibernar. Configurável por env.
  private readonly idleThresholdMs = Math.max(
    30_000,
    Number(process.env.IDLE_ACTIVITY_THRESHOLD_MS ?? '120000'),
  );

  /** Chamado pelo middleware global em CADA request HTTP. */
  touch() {
    this.lastHttpAt = Date.now();
  }

  /** Chamado pelo gateway WS na conexão/desconexão de cada cliente. */
  wsConnected() {
    this.wsClients += 1;
  }
  wsDisconnected() {
    this.wsClients = Math.max(0, this.wsClients - 1);
  }
  get wsClientCount() {
    return this.wsClients;
  }

  /**
   * True se há cliente WS conectado OU houve request HTTP dentro da janela.
   * Quando false, os tickers de fundo pulam o acesso ao banco.
   */
  isActive(): boolean {
    return this.wsClients > 0 || Date.now() - this.lastHttpAt < this.idleThresholdMs;
  }
}
