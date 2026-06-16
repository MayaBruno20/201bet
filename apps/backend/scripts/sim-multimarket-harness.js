/**
 * Harness de simulação do motor multi-mercado (pari-mutuel N opções).
 *
 * Réplica FIEL do fluxo de dinheiro do backend real:
 *  - placeBet:      multi-runner-market.service.ts (stake sai da carteira)
 *  - settle:        settlement.service.ts settleMarket (rake 20%, odd = max(1.0, net/winnerPool),
 *                   comissão de afiliado = stake * rake * min(pct,100)/100 por aposta)
 *  - void:          voidMarket (refund integral das apostas OPEN)
 *  - refundSettled: refundSettledMarket (devolve stakes a todos + REVERTE payouts dos
 *                   ganhadores — saldo pode ficar NEGATIVO; comissões só marcadas reversed)
 *
 * Convenção de P&L da casa (visão caixa):
 *  housePnL = totalEntrou - totalPagoGanhadores - totalComissõesAfiliados
 *  exposure = soma dos saldos negativos deixados em carteiras (dinheiro que a casa
 *             pode nunca recuperar — risco real do estorno de settle).
 *
 * Uso programático:  const { Market } = require('./sim-multimarket-harness');
 * Uso CLI:           node sim-multimarket-harness.js cenario.json
 *   cenario.json: { "runners": ["A","B"], "bets": [{"user":"u1","runner":"A","amount":100,"affiliatePct":25}],
 *                   "action": "settle"|"void"|"settleThenRefund", "winner": "A" }
 */

const RAKE = 0.20; // HOUSE_MARGIN_PERCENT = 20 (fixo, market.service.ts)

class Market {
  constructor(runnerLabels) {
    if (!Array.isArray(runnerLabels) || runnerLabels.length < 2) throw new Error('>=2 runners');
    this.runners = runnerLabels.map((label, i) => ({ oddId: `odd-${i}`, label }));
    this.bets = []; // { user, oddId, stake, affiliatePct, status: OPEN|WON|LOST|REFUNDED, payout }
    this.status = 'OPEN';
    this.wallets = new Map(); // user -> saldo líquido acumulado na plataforma (0 = neutro)
    this.houseCash = 0;       // caixa da casa (entradas - saídas)
    this.affiliatePaid = 0;   // comissões devidas a afiliados (saem do caixa da casa)
  }

  _wallet(user) {
    if (!this.wallets.has(user)) this.wallets.set(user, 0);
    return this.wallets.get(user);
  }
  _credit(user, v) { this.wallets.set(user, this._wallet(user) + v); }

  oddIdOf(runnerLabel) {
    const r = this.runners.find((r) => r.label === runnerLabel);
    if (!r) throw new Error(`runner ${runnerLabel} não existe`);
    return r.oddId;
  }

  /** Odd exibida agora (espelha recalculateOdds: piso 1.0; 0 se pool=0). */
  displayedOdds() {
    const pools = this.poolsByOdd();
    const total = [...pools.values()].reduce((s, v) => s + v, 0);
    const net = total * (1 - RAKE);
    const out = {};
    for (const r of this.runners) {
      const p = pools.get(r.oddId) ?? 0;
      out[r.label] = p > 0 ? Math.max(1.0, net / p) : 0;
    }
    return out;
  }

  poolsByOdd(statuses = ['OPEN']) {
    const m = new Map();
    for (const b of this.bets) {
      if (!statuses.includes(b.status)) continue;
      m.set(b.oddId, (m.get(b.oddId) ?? 0) + b.stake);
    }
    return m;
  }

  /** placeBet: stake sai da carteira do user e entra no caixa da casa (custódia). */
  placeBet(user, runnerLabel, amount, affiliatePct = 0) {
    if (this.status !== 'OPEN') throw new Error('mercado não está OPEN');
    if (!(amount > 0)) throw new Error('valor inválido');
    const oddId = this.oddIdOf(runnerLabel);
    this._credit(user, -amount);
    this.houseCash += amount;
    const bet = { user, oddId, stake: amount, affiliatePct: Math.min(Math.max(affiliatePct, 0), 100), status: 'OPEN', payout: 0 };
    this.bets.push(bet);
    return bet;
  }

  /** settleMarket fiel: rake nominal, piso 1.0, comissão por aposta (cap 100% do rake). */
  settle(winnerLabel) {
    if (this.status === 'SETTLED') throw new Error('já liquidado');
    const winnerOddId = this.oddIdOf(winnerLabel);
    const open = this.bets.filter((b) => b.status === 'OPEN');

    const totalPool = open.reduce((s, b) => s + b.stake, 0);
    const rakeCollected = totalPool * RAKE;
    const netPool = totalPool - rakeCollected;
    const winnerPool = open.filter((b) => b.oddId === winnerOddId).reduce((s, b) => s + b.stake, 0);

    const rawOdd = winnerPool > 0 ? netPool / winnerPool : 0;
    const odd = winnerPool > 0 ? Math.max(1.0, rawOdd) : 0;

    let totalPayout = 0;
    let totalCommission = 0;
    for (const b of open) {
      if (b.oddId === winnerOddId) {
        b.status = 'WON';
        b.payout = b.stake * odd;
        totalPayout += b.payout;
        this._credit(b.user, b.payout);
        this.houseCash -= b.payout;
      } else {
        b.status = 'LOST';
      }
      // settlement.service.ts:262-279 — comissão sobre TODA aposta (ganha ou perdida)
      const commission = b.stake * RAKE * (b.affiliatePct / 100);
      if (commission > 0) {
        totalCommission += commission;
        this.affiliatePaid += commission;
        this.houseCash -= commission;
      }
    }
    this.status = 'SETTLED';
    this.winnerOddId = winnerOddId;
    return {
      totalPool, rakeCollected, netPool, winnerPool, rawOdd, oddApplied: odd,
      totalPayout, totalCommission,
      housePnL: totalPool - totalPayout - totalCommission,
      flooredAt1: winnerPool > 0 && rawOdd < 1.0,
    };
  }

  /** voidMarket: refund integral das OPEN. Casa zera. */
  void_() {
    if (this.status === 'SETTLED') throw new Error('liquidado não anula (use refundSettled)');
    let refunded = 0;
    for (const b of this.bets) {
      if (b.status !== 'OPEN') continue;
      b.status = 'REFUNDED';
      this._credit(b.user, b.stake);
      this.houseCash -= b.stake;
      refunded += b.stake;
    }
    this.status = 'CLOSED';
    return { refunded, housePnL: this.housePnL() };
  }

  /**
   * refundSettledMarket fiel: devolve o STAKE a todos (WON e LOST) e DEBITA o
   * payout dos ganhadores (saldo pode ficar negativo). Comissões: só marcadas
   * reversed — o valor devido ao afiliado NÃO volta pro caixa (regra real).
   */
  refundSettled() {
    if (this.status !== 'SETTLED') throw new Error('não está SETTLED');
    for (const b of this.bets) {
      if (b.status !== 'WON' && b.status !== 'LOST') continue;
      this._credit(b.user, b.stake);
      this.houseCash -= b.stake;
      if (b.status === 'WON' && b.payout > 0) {
        this._credit(b.user, -b.payout);
        this.houseCash += b.payout;
      }
      b.status = 'REFUNDED';
      b.payout = 0;
    }
    this.status = 'OPEN';
    this.winnerOddId = null;
    return { housePnL: this.housePnL(), exposure: this.negativeExposure() };
  }

  housePnL() { return this.houseCash; }

  /** Saldos negativos deixados nas carteiras (risco de calote contra a casa). */
  negativeExposure() {
    let e = 0;
    for (const v of this.wallets.values()) if (v < 0 - 1e-9) {
      // saldo líquido < 0 só conta como exposição se o usuário ficou DEVENDO
      // (recebeu mais do que tem). Aqui wallets partem de 0, então saldo
      // negativo = apostou do próprio bolso (não é dívida). Exposição real é
      // medida por quem ficou com débito após reversão — ver walletDebts().
    }
    return this.walletDebts();
  }

  /**
   * Dívidas pós-reversão: simula carteira real (começa com o depósito = soma
   * das apostas do user). Se após estorno o saldo da carteira real < 0, o user
   * está devendo a diferença à casa.
   */
  walletDebts() {
    const deposited = new Map();
    for (const b of this.bets) deposited.set(b.user, (deposited.get(b.user) ?? 0) + b.stake);
    let debt = 0;
    for (const [user, delta] of this.wallets) {
      const realBalance = (deposited.get(user) ?? 0) + delta;
      if (realBalance < -1e-9) debt += -realBalance;
    }
    return debt;
  }
}

function runScenario(sc) {
  const mkt = new Market(sc.runners);
  for (const b of sc.bets) mkt.placeBet(b.user, b.runner, b.amount, b.affiliatePct ?? 0);
  const oddsBefore = mkt.displayedOdds();
  let result;
  if (sc.action === 'void') result = mkt.void_();
  else if (sc.action === 'settleThenRefund') { mkt.settle(sc.winner); result = mkt.refundSettled(); }
  else result = mkt.settle(sc.winner);
  return { oddsBefore, result, housePnL: mkt.housePnL(), walletDebts: mkt.walletDebts() };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('uso: node sim-multimarket-harness.js cenario.json'); process.exit(1); }
  const sc = JSON.parse(require('fs').readFileSync(file, 'utf-8'));
  console.log(JSON.stringify(runScenario(sc), null, 2));
}

module.exports = { Market, runScenario, RAKE };
