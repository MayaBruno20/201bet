import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { BetStatus, DuelStatus, MarketStatus, OddStatus, Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from './database/prisma.service';
import { MarketGateway } from './market.gateway';
import { HOUSE_MARGIN_PERCENT } from './market.service';
import { applyChallengerWinSwap, shouldSwapOnSettle } from './brazil-lists/roster-swap.util';

type AuditContext = {
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type SettlementResult = {
  marketId: string;
  winnerOddId: string;
  winnerLabel: string;
  totalPool: number;
  rakeCollected: number;
  totalPayout: number;
  totalAffiliateCommission: number;
  houseNetProfit: number;
  winningBets: number;
  losingBets: number;
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Optional para evitar circular dep em modulos onde gateway nao esta carregado
    @Optional() @Inject(forwardRef(() => MarketGateway))
    private readonly marketGateway?: MarketGateway,
  ) {}

  async settleMarket(marketId: string, winnerOddId: string, audit: AuditContext = {}): Promise<SettlementResult> {
    // Margem da casa é FIXA (HOUSE_MARGIN_PERCENT). A coluna market.rakePercent
    // existe por motivos históricos mas é ignorada — a regra é uniforme.
    const effectiveRake = HOUSE_MARGIN_PERCENT;

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the market row to prevent concurrent settlement
      const lockedMarket = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Market" WHERE id = ${marketId} FOR UPDATE
      `.then((rows) => rows[0] ?? null);

      if (!lockedMarket) {
        throw new NotFoundException('Mercado não encontrado');
      }

      if (lockedMarket.status === 'SETTLED') {
        throw new BadRequestException('Mercado já foi liquidado');
      }

      if (!['OPEN', 'CLOSED', 'SUSPENDED'].includes(lockedMarket.status)) {
        throw new BadRequestException('Mercado não está em um status que permite liquidação');
      }

      // Load full market data inside the transaction
      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          odds: { include: { betItems: { include: { bet: { include: { user: { include: { wallet: true, affiliate: true } } } } } } } },
        },
      });

      if (!market) throw new NotFoundException('Mercado não encontrado');

      // Mercado multi-vencedor (QUALIFY) não pode ser liquidado por 1 vencedor só
      // — pagaria errado. Vai pelo fluxo settleMultiWinnerMarket (apuração dos classificados).
      if (market.type === 'QUALIFY') {
        throw new BadRequestException('Mercado de classificados liquida pelo fluxo de múltiplos vencedores, não por vencedor único.');
      }

      const winnerOdd = market.odds.find((o) => o.id === winnerOddId);
      if (!winnerOdd) {
        throw new BadRequestException('Opção vencedora não pertence a este mercado');
      }

      // Deduplicate bets (a bet can have multiple items) and calculate pools
      const seenBetIds = new Set<string>();
      let totalPool = 0;
      const uniqueBets: Array<{
        betId: string;
        stake: number;
        oddId: string;
        user: typeof market.odds[0]['betItems'][0]['bet']['user'];
      }> = [];

      for (const odd of market.odds) {
        for (const betItem of odd.betItems) {
          if (betItem.bet.status !== BetStatus.OPEN) continue;
          if (seenBetIds.has(betItem.betId)) continue;
          seenBetIds.add(betItem.betId);
          const stake = Number(betItem.bet.stake);
          totalPool += stake;
          uniqueBets.push({ betId: betItem.betId, stake, oddId: odd.id, user: betItem.bet.user });
        }
      }

      const rakeCollected = totalPool * (effectiveRake / 100);
      const netPool = totalPool - rakeCollected;

      let winnerPool = 0;
      for (const bet of uniqueBets) {
        if (bet.oddId === winnerOddId) winnerPool += bet.stake;
      }

      // Pari-mutuel puro: odd = netPool / winnerPool. Em casos de mega esmagamento
      // (ex.: 50 num lado, 1000 no outro), a odd "crua" do lado popular fica < 1.0.
      // Regra de produto: vencedor NUNCA recebe menos que o stake — piso 1.0.
      //
      // Invariante de proteção da casa (verificada pelo piso):
      //   totalPayout = winnerPool * max(1.0, netPool / winnerPool)
      //              <= winnerPool * (netPool / winnerPool)  quando rawOdd >= 1.0  ⇒ <= netPool < totalPool
      //              <= winnerPool * 1.0 = winnerPool        quando rawOdd <  1.0  ⇒ <= totalPool (pois winnerPool <= totalPool)
      // Em ambos os ramos, totalPayout <= totalPool. A casa pode coletar menos
      // que os 20% nominais em esmagamento extremo, mas NUNCA paga do próprio bolso.
      const rawParimutuelOdd = winnerPool > 0 ? netPool / winnerPool : 0;
      const parimutuelOdd = winnerPool > 0 ? Math.max(1.0, rawParimutuelOdd) : 0;

      // 1. Update market status atomically
      await tx.market.update({
        where: { id: marketId },
        data: {
          status: MarketStatus.SETTLED,
          winnerOddId,
          settledAt: new Date(),
        },
      });

      // 1.5. Propaga liquidação pro matchup de origem (Lista/Armageddon/SharkTank).
      // Convenção: odds ordenadas por createdAt asc — odds[0]=LEFT, odds[1]=RIGHT
      // (mesma convenção usada em settleDuel, ver linha ~299).
      // updateMany com winnerSide:null evita sobrescrever se o matchup já foi
      // auditado pelo seu próprio endpoint (idempotência).
      if (market.duelId) {
        // Embate auditado → FECHADO (FINISHED). Sem isto o duelo seguia no status
        // anterior (ex.: BOOKING_OPEN), era recarregado pelo refresh do engine e
        // reaparecia como "ao vivo" no card da home / no /apostas.
        // Só o mercado PRIMÁRIO do embate (type DUEL) fecha o duelo — um mercado
        // secundário (multi-runner) ligado ao mesmo duelId não pode fechá-lo.
        if (market.type === 'DUEL') {
          await tx.duel.update({
            where: { id: market.duelId },
            data: { status: DuelStatus.FINISHED },
          });
        }

        const orderedOdds = await tx.odd.findMany({
          where: { marketId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });

        let derivedSide: 'LEFT' | 'RIGHT' | null = null;
        if (orderedOdds.length >= 2) {
          if (winnerOddId === orderedOdds[0].id) derivedSide = 'LEFT';
          else if (winnerOddId === orderedOdds[1].id) derivedSide = 'RIGHT';
        }

        if (derivedSide) {
          const settledNow = new Date();

          // Lista Brasil: buscamos ANTES do update os matchups ainda não auditados
          // (winnerSide:null) para, além de gravar o vencedor, aplicar a troca de
          // posições do roster — a MESMA regra do botão "Auditar" (adminSettleMatchup).
          // Sem isto, liquidar pelo mercado/duelo gravava o vencedor mas NÃO reordenava
          // a Lista (e a rodada seguinte saía com pareamentos errados).
          const listMatchups = await tx.listMatchup.findMany({
            where: { duelId: market.duelId, winnerSide: null },
            include: { listEvent: { select: { listId: true } } },
          });

          await tx.listMatchup.updateMany({
            where: { duelId: market.duelId, winnerSide: null },
            data: { winnerSide: derivedSide, settledAt: settledNow },
          });
          await tx.armageddonMatchup.updateMany({
            where: { duelId: market.duelId, winnerSide: null },
            data: { winnerSide: derivedSide, settledAt: settledNow },
          });

          for (const m of listMatchups) {
            if (!shouldSwapOnSettle(m, derivedSide)) continue;
            const listId = m.listEvent.listId;
            await applyChallengerWinSwap(tx, {
              listId,
              challengerPos: m.leftPosition!,
              defenderPos: m.rightPosition!,
              challengerDriverId: m.leftDriverId!,
              defenderDriverId: m.rightDriverId!,
            });
            await tx.auditLog.create({
              data: {
                actorUserId: audit.actorUserId,
                action: 'BRAZIL_ROSTER_SWAP',
                entity: 'BrazilList',
                entityId: listId,
                payload: {
                  matchupId: m.id,
                  challengerPos: m.leftPosition,
                  defenderPos: m.rightPosition,
                  challengerDriverId: m.leftDriverId,
                  defenderDriverId: m.rightDriverId,
                  source: 'settleMarket',
                } as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      // 2. Close all odds
      await tx.odd.updateMany({
        where: { marketId },
        data: { status: OddStatus.CLOSED },
      });

      let totalPayout = 0;
      let totalAffiliateCommission = 0;
      let winningBets = 0;
      let losingBets = 0;

      // 3. Process each unique bet
      for (const bet of uniqueBets) {
        const isWinner = bet.oddId === winnerOddId;

        if (isWinner) {
          winningBets++;
          const payout = bet.stake * parimutuelOdd;
          totalPayout += payout;

          await tx.bet.update({
            where: { id: bet.betId },
            data: {
              status: BetStatus.WON,
              potentialWin: new Prisma.Decimal(payout.toFixed(4)),
            },
          });

          const wallet = bet.user.wallet;
          if (wallet) {
            await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: WalletTransactionType.BET_WON,
                amount: new Prisma.Decimal(payout.toFixed(4)),
                reference: bet.betId,
              },
            });

            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: new Prisma.Decimal(payout.toFixed(4)) } },
            });
          }
        } else {
          losingBets++;
          await tx.bet.update({
            where: { id: bet.betId },
            data: { status: BetStatus.LOST },
          });
        }

        // 4. Calculate affiliate commission (capped at 100% of rake)
        const affiliate = bet.user.affiliate;
        if (affiliate && affiliate.active) {
          const afPct = Math.min(Number(affiliate.commissionPct), 100);
          const commission = bet.stake * (effectiveRake / 100) * (afPct / 100);
          if (commission > 0) {
            totalAffiliateCommission += commission;

            await tx.affiliateCommission.create({
              data: {
                affiliateId: affiliate.id,
                betId: bet.betId,
                marketId,
                amount: new Prisma.Decimal(commission.toFixed(4)),
              },
            });
          }
        }
      }

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: 'SETTLE_MARKET',
          entity: 'Market',
          entityId: marketId,
          payload: {
            winnerOddId,
            winnerLabel: winnerOdd.label,
            totalPool,
            rakeCollected,
            totalPayout,
            totalAffiliateCommission,
            winningBets,
            losingBets,
            parimutuelOddApplied: parimutuelOdd,
            parimutuelOddRaw: rawParimutuelOdd,
            flooredAt1: rawParimutuelOdd > 0 && rawParimutuelOdd < 1.0,
          } as unknown as Prisma.InputJsonValue,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return {
        totalPool,
        rakeCollected,
        totalPayout,
        totalAffiliateCommission,
        winningBets,
        losingBets,
        winnerLabel: winnerOdd.label,
      };
    }, { timeout: 60_000, maxWait: 5_000 });

    const houseNetProfit = result.rakeCollected - result.totalAffiliateCommission;

    this.logger.log(
      `Market ${marketId} settled: winner=${result.winnerLabel}, pool=${result.totalPool.toFixed(2)}, ` +
      `rake=${result.rakeCollected.toFixed(2)}, payout=${result.totalPayout.toFixed(2)}, ` +
      `affiliate=${result.totalAffiliateCommission.toFixed(2)}, houseNet=${houseNetProfit.toFixed(2)}`,
    );

    // Notifica clientes via WebSocket
    try {
      this.marketGateway?.emitSettlement({
        marketId,
        winnerOddId,
        winnerLabel: result.winnerLabel,
      });
    } catch (e) {
      this.logger.warn(`Falha ao emitir settlement por WS: ${e instanceof Error ? e.message : e}`);
    }

    return {
      marketId,
      winnerOddId,
      winnerLabel: result.winnerLabel,
      totalPool: result.totalPool,
      rakeCollected: result.rakeCollected,
      totalPayout: result.totalPayout,
      totalAffiliateCommission: result.totalAffiliateCommission,
      houseNetProfit,
      winningBets: result.winningBets,
      losingBets: result.losingBets,
    };
  }

  /**
   * Liquidação MULTI-VENCEDOR (ex.: "32 classificados ao resorteio").
   * Vários `winnerOddIds` ganham ao mesmo tempo. O pote líquido (após rake de
   * 20%) é rateado entre TODAS as apostas das opções vencedoras, proporcional
   * ao stake — todas com o MESMO multiplicador.
   *
   * Invariante de proteção da casa (idêntica ao single-winner):
   *   odd = max(1.0, netPool / winnerPool); payout = winnerPool * odd
   *       = max(winnerPool, netPool) <= totalPool
   *   ⇒ a casa NUNCA paga do próprio bolso (no pior caso, esmagamento, a
   *   margem encolhe até 0). Comissões de afiliado saem de dentro do rake.
   *
   * Não grava `winnerOddId` (são vários) — a verdade fica nos status das Bets
   * (WON/LOST) e no AuditLog. Idempotente sob lock pelo status SETTLED.
   */
  async settleMultiWinnerMarket(
    marketId: string,
    winnerOddIds: string[],
    audit: AuditContext = {},
  ): Promise<Omit<SettlementResult, 'winnerOddId' | 'winnerLabel'> & { winnerOddIds: string[]; winnerLabels: string[] }> {
    const effectiveRake = HOUSE_MARGIN_PERCENT;
    const winnerSet = new Set(winnerOddIds);

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Market" WHERE id = ${marketId} FOR UPDATE
      `.then((rows) => rows[0] ?? null);
      if (!locked) throw new NotFoundException('Mercado não encontrado');
      if (locked.status === 'SETTLED') throw new BadRequestException('Mercado já foi liquidado');
      if (!['OPEN', 'CLOSED', 'SUSPENDED'].includes(locked.status)) {
        throw new BadRequestException('Mercado não está em um status que permite liquidação');
      }

      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          odds: { include: { betItems: { include: { bet: { include: { user: { include: { wallet: true, affiliate: true } } } } } } } },
        },
      });
      if (!market) throw new NotFoundException('Mercado não encontrado');

      const validWinners = market.odds.filter((o) => winnerSet.has(o.id));
      if (validWinners.length === 0) {
        throw new BadRequestException('Nenhuma das opções vencedoras pertence a este mercado');
      }
      const winnerLabels = validWinners.map((o) => o.label);

      // Deduplica bets e calcula pools.
      const seen = new Set<string>();
      let totalPool = 0;
      let winnerPool = 0;
      const uniqueBets: Array<{ betId: string; stake: number; oddId: string; user: typeof market.odds[0]['betItems'][0]['bet']['user'] }> = [];
      for (const odd of market.odds) {
        for (const it of odd.betItems) {
          if (it.bet.status !== BetStatus.OPEN) continue;
          if (seen.has(it.betId)) continue;
          seen.add(it.betId);
          const stake = Number(it.bet.stake);
          totalPool += stake;
          if (winnerSet.has(odd.id)) winnerPool += stake;
          uniqueBets.push({ betId: it.betId, stake, oddId: odd.id, user: it.bet.user });
        }
      }

      const rakeCollected = totalPool * (effectiveRake / 100);
      const netPool = totalPool - rakeCollected;
      const rawOdd = winnerPool > 0 ? netPool / winnerPool : 0;
      const payoutOdd = winnerPool > 0 ? Math.max(1.0, rawOdd) : 0;

      await tx.market.update({
        where: { id: marketId },
        data: { status: MarketStatus.SETTLED, winnerOddId: null, settledAt: new Date() },
      });
      await tx.odd.updateMany({ where: { marketId }, data: { status: OddStatus.CLOSED } });

      let totalPayout = 0;
      let totalAffiliateCommission = 0;
      let winningBets = 0;
      let losingBets = 0;

      for (const bet of uniqueBets) {
        const isWinner = winnerSet.has(bet.oddId);
        if (isWinner) {
          winningBets++;
          const payout = bet.stake * payoutOdd;
          totalPayout += payout;
          await tx.bet.update({
            where: { id: bet.betId },
            data: { status: BetStatus.WON, potentialWin: new Prisma.Decimal(payout.toFixed(4)) },
          });
          const wallet = bet.user.wallet;
          if (wallet) {
            await tx.walletTransaction.create({
              data: { walletId: wallet.id, type: WalletTransactionType.BET_WON, amount: new Prisma.Decimal(payout.toFixed(4)), reference: bet.betId },
            });
            await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: new Prisma.Decimal(payout.toFixed(4)) } } });
          }
        } else {
          losingBets++;
          await tx.bet.update({ where: { id: bet.betId }, data: { status: BetStatus.LOST } });
        }

        const affiliate = bet.user.affiliate;
        if (affiliate && affiliate.active) {
          const afPct = Math.min(Number(affiliate.commissionPct), 100);
          const commission = bet.stake * (effectiveRake / 100) * (afPct / 100);
          if (commission > 0) {
            totalAffiliateCommission += commission;
            await tx.affiliateCommission.create({
              data: { affiliateId: affiliate.id, betId: bet.betId, marketId, amount: new Prisma.Decimal(commission.toFixed(4)) },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: 'SETTLE_MULTI_WINNER_MARKET',
          entity: 'Market',
          entityId: marketId,
          payload: {
            winnerOddIds: validWinners.map((o) => o.id),
            winnerLabels,
            totalPool, rakeCollected, totalPayout, totalAffiliateCommission,
            winningBets, losingBets, payoutOddApplied: payoutOdd, payoutOddRaw: rawOdd,
            flooredAt1: rawOdd > 0 && rawOdd < 1.0,
          } as unknown as Prisma.InputJsonValue,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return { totalPool, rakeCollected, totalPayout, totalAffiliateCommission, winningBets, losingBets, winnerLabels };
    }, { timeout: 60_000, maxWait: 5_000 });

    const houseNetProfit = result.rakeCollected - result.totalAffiliateCommission;
    this.logger.log(
      `Multi-winner market ${marketId} settled: winners=${result.winnerLabels.length}, pool=${result.totalPool.toFixed(2)}, ` +
      `payout=${result.totalPayout.toFixed(2)}, affiliate=${result.totalAffiliateCommission.toFixed(2)}, houseNet=${houseNetProfit.toFixed(2)}`,
    );

    try {
      this.marketGateway?.emitSettlement({ marketId, winnerOddId: '', winnerLabel: `${result.winnerLabels.length} classificados` });
    } catch (e) {
      this.logger.warn(`Falha ao emitir settlement multi-winner por WS: ${e instanceof Error ? e.message : e}`);
    }

    return {
      marketId,
      winnerOddIds,
      winnerLabels: result.winnerLabels,
      totalPool: result.totalPool,
      rakeCollected: result.rakeCollected,
      totalPayout: result.totalPayout,
      totalAffiliateCommission: result.totalAffiliateCommission,
      houseNetProfit,
      winningBets: result.winningBets,
      losingBets: result.losingBets,
    };
  }

  async settleDuel(duelId: string, winningSide: 'LEFT' | 'RIGHT', audit: AuditContext = {}): Promise<SettlementResult> {
    // Find the market linked to this duel (or the event's first market)
    let market = await this.prisma.market.findFirst({
      where: { duelId, status: { in: [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED] } },
      include: { odds: { orderBy: { createdAt: 'asc' } } },
    });

    if (!market) {
      // Fallback: find via duel's event
      const duel = await this.prisma.duel.findUnique({
        where: { id: duelId },
        include: {
          event: {
            include: {
              markets: {
                where: { type: 'DUEL', status: { in: [MarketStatus.OPEN, MarketStatus.CLOSED, MarketStatus.SUSPENDED] } },
                include: { odds: { orderBy: { createdAt: 'asc' } } },
                take: 1,
              },
            },
          },
        },
      });

      market = duel?.event.markets[0] ?? null;
    }

    if (!market || market.odds.length < 2) {
      throw new NotFoundException('Mercado do duelo não encontrado ou sem odds suficientes');
    }

    const winnerOddId = winningSide === 'LEFT' ? market.odds[0].id : market.odds[1].id;
    return this.settleMarket(market.id, winnerOddId, audit);
  }

  async voidMarket(marketId: string, audit: AuditContext = {}) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        odds: {
          include: {
            betItems: {
              include: { bet: { include: { user: { include: { wallet: true } } } } },
            },
          },
        },
      },
    });

    if (!market) {
      throw new NotFoundException('Mercado não encontrado');
    }

    if (market.status === MarketStatus.SETTLED) {
      throw new BadRequestException('Mercado já liquidado não pode ser anulado');
    }

    await this.prisma.$transaction(async (tx) => {
      // Close market
      await tx.market.update({
        where: { id: marketId },
        data: { status: MarketStatus.CLOSED },
      });

      await tx.odd.updateMany({
        where: { marketId },
        data: { status: OddStatus.CLOSED },
      });

      // Refund all open bets
      const processedBetIds = new Set<string>();

      for (const odd of market.odds) {
        for (const betItem of odd.betItems) {
          if (processedBetIds.has(betItem.betId)) continue;
          if (betItem.bet.status !== BetStatus.OPEN) continue;
          processedBetIds.add(betItem.betId);

          const stake = betItem.bet.stake;

          await tx.bet.update({
            where: { id: betItem.betId },
            data: { status: BetStatus.REFUNDED },
          });

          const wallet = betItem.bet.user.wallet;
          if (wallet) {
            await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: WalletTransactionType.BET_REFUND,
                amount: stake,
                reference: betItem.betId,
              },
            });

            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: { increment: stake } },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: 'VOID_MARKET',
          entity: 'Market',
          entityId: marketId,
          payload: { refundedBets: processedBetIds.size } as unknown as Prisma.InputJsonValue,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });
    }, { timeout: 60_000, maxWait: 5_000 });

    return { marketId, status: 'VOIDED', refundedBets: market.odds.flatMap((o) => o.betItems).length };
  }

  /**
   * ESTORNO DE SETTLE (reset). Reverte um mercado JÁ LIQUIDADO (SETTLED):
   *  - devolve o STAKE a todos (ganhadores e perdedores) — BET_REFUND;
   *  - desfaz o PAYOUT dos ganhadores (pode deixar saldo negativo — política do dono);
   *  - marca as comissões de afiliado como `reversed` (NÃO mexe no saldo do afiliado);
   *  - "des-liquida" o mercado (volta a OPEN), reseta pool e reverte o vencedor no matchup.
   *
   * Idempotente pelo status sob lock: SETTLED→OPEN é atômico; um retry encontra
   * OPEN e sai sem fazer nada. NÃO usar em mercado não-SETTLED (use voidMarket).
   */
  async refundSettledMarket(marketId: string, audit: AuditContext = {}) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Market" WHERE id = ${marketId} FOR UPDATE
      `.then((rows) => rows[0] ?? null);
      if (!locked) throw new NotFoundException('Mercado não encontrado');
      if (locked.status !== 'SETTLED') {
        return { marketId, skipped: true as const }; // já estornado / não-liquidado
      }

      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          odds: { include: { betItems: { include: { bet: { include: { user: { include: { wallet: true } } } } } } } },
        },
      });
      if (!market) throw new NotFoundException('Mercado não encontrado');

      // Bets liquidadas (WON/LOST) deste mercado, deduplicadas.
      const seen = new Set<string>();
      const bets: Array<{ betId: string; stake: number; potentialWin: number; won: boolean; walletId: string | null }> = [];
      for (const odd of market.odds) {
        for (const it of odd.betItems) {
          const b = it.bet;
          if (seen.has(b.id)) continue;
          if (b.status !== BetStatus.WON && b.status !== BetStatus.LOST) continue;
          seen.add(b.id);
          bets.push({
            betId: b.id,
            stake: Number(b.stake),
            potentialWin: Number(b.potentialWin),
            won: b.status === BetStatus.WON,
            walletId: b.user.wallet?.id ?? null,
          });
        }
      }

      let refundedStake = 0;
      let reversedPayout = 0;
      for (const b of bets) {
        // 1) devolve o stake a todos
        if (b.walletId) {
          await tx.wallet.update({ where: { id: b.walletId }, data: { balance: { increment: new Prisma.Decimal(b.stake.toFixed(4)) } } });
          await tx.walletTransaction.create({ data: { walletId: b.walletId, type: WalletTransactionType.BET_REFUND, amount: new Prisma.Decimal(b.stake.toFixed(4)), reference: b.betId } });
        }
        refundedStake += b.stake;
        // 2) desfaz o payout dos ganhadores (saldo pode ficar negativo)
        if (b.won && b.potentialWin > 0 && b.walletId) {
          await tx.wallet.update({ where: { id: b.walletId }, data: { balance: { decrement: new Prisma.Decimal(b.potentialWin.toFixed(4)) } } });
          await tx.walletTransaction.create({ data: { walletId: b.walletId, type: WalletTransactionType.ADJUSTMENT, amount: new Prisma.Decimal((-b.potentialWin).toFixed(4)), reference: `reversal-${b.betId}` } });
          reversedPayout += b.potentialWin;
        }
        await tx.bet.update({ where: { id: b.betId }, data: { status: BetStatus.REFUNDED, potentialWin: new Prisma.Decimal('0') } });
      }

      // 3) comissões de afiliado: só marca revertidas (não mexe no saldo)
      await tx.affiliateCommission.updateMany({ where: { marketId, reversed: false }, data: { reversed: true } });

      // 4) des-liquida o mercado + reabre odds
      await tx.market.update({ where: { id: marketId }, data: { status: MarketStatus.OPEN, winnerOddId: null, settledAt: null } });
      await tx.odd.updateMany({ where: { marketId }, data: { status: OddStatus.ACTIVE } });

      // 5) reseta pool e reverte a propagação do vencedor no matchup (lista/armageddon)
      if (market.duelId) {
        // Des-liquidar reabre o embate: espelho do fechamento feito no settleMarket.
        // updateMany gated em FINISHED → só reabre o que estava de fato fechado por
        // auditoria; nunca força um duelo de outro estado (SCHEDULED/BOOKING_CLOSED/
        // CANCELED) a ficar "ao vivo".
        await tx.duel.updateMany({
          where: { id: market.duelId, status: DuelStatus.FINISHED },
          data: { status: DuelStatus.BOOKING_OPEN },
        });
        await tx.duelPoolState.updateMany({ where: { duelId: market.duelId }, data: { leftPool: 0, rightPool: 0, leftTickets: 0, rightTickets: 0 } });
        await tx.armageddonMatchup.updateMany({ where: { duelId: market.duelId, winnerSide: { not: null } }, data: { winnerSide: null, settledAt: null } });
        await tx.listMatchup.updateMany({ where: { duelId: market.duelId, winnerSide: { not: null } }, data: { winnerSide: null, settledAt: null } });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: audit.actorUserId,
          action: 'REFUND_SETTLED_MARKET',
          entity: 'Market',
          entityId: marketId,
          payload: { betsRefunded: bets.length, refundedStake, reversedPayout } as Prisma.InputJsonValue,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return { marketId, betsRefunded: bets.length, refundedStake, reversedPayout, skipped: false as const };
    }, { timeout: 60_000, maxWait: 5_000 });
  }

}
