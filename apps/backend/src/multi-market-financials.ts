import { BetStatus, Prisma } from '@prisma/client';
import { PrismaService } from './database/prisma.service';

/**
 * Matemática financeira dos multi-mercados (pari-mutuel N opções).
 *
 * Espelha EXATAMENTE a regra aplicada pela liquidação (settlement.service):
 *   netPool = totalPool * (1 - rake)
 *   odd     = max(1.0, netPool / poolDaOpção)   (0 se ninguém apostou nela)
 *   payout  = poolDaOpção * odd
 *
 * Invariante de proteção da casa (vale para QUALQUER cenário):
 *   payout = max(poolDaOpção, netPool) <= totalPool
 *   ⇒ lucroBrutoCasa = totalPool - payout >= 0 — a casa NUNCA paga do próprio
 *   bolso; no pior caso (esmagamento extremo) ela coleta menos que os 20%
 *   nominais, mas jamais fica negativa. Comissões de afiliado saem de DENTRO
 *   do rake (cap de 100% do rake por aposta), então também não furam o caixa.
 */

export type RunnerPoolInput = {
  oddId: string;
  label: string;
  pool: number;
  tickets: number;
};

export type RunnerProjection = RunnerPoolInput & {
  /** % deste pote sobre o pote total (0-100). */
  poolShare: number;
  /** Odd crua netPool/pool, sem piso (referência de auditoria). */
  rawOdd: number;
  /** Odd efetiva que a liquidação aplicará: max(1.0, rawOdd); 0 se pool=0. */
  projectedOdd: number;
  /** true quando o piso 1.0 foi aplicado (cenário de esmagamento). */
  flooredAt1: boolean;
  /** Total pago aos ganhadores SE esta opção vencer. */
  projectedPayout: number;
  /** Sobra bruta da casa neste cenário (antes de comissões). Nunca negativa. */
  projectedHouseGross: number;
};

export type MultiMarketFinancials = {
  totalPool: number;
  rakePercent: number;
  /** Rake nominal: totalPool * rake. Em esmagamento a casa coleta menos. */
  rakeNominal: number;
  netPool: number;
  runners: RunnerProjection[];
};

const money = (v: number) => Number(v.toFixed(2));
const oddFmt = (v: number) => Number(v.toFixed(4));

export function computeMultiMarketFinancials(
  runners: RunnerPoolInput[],
  rakePercent: number,
): MultiMarketFinancials {
  const totalPool = runners.reduce((sum, r) => sum + r.pool, 0);
  const rakeNominal = totalPool * (rakePercent / 100);
  const netPool = totalPool - rakeNominal;

  const projections: RunnerProjection[] = runners.map((r) => {
    const rawOdd = r.pool > 0 ? netPool / r.pool : 0;
    const projectedOdd = r.pool > 0 ? Math.max(1.0, rawOdd) : 0;
    const projectedPayout = r.pool * projectedOdd;
    return {
      ...r,
      pool: money(r.pool),
      poolShare: totalPool > 0 ? Number(((r.pool / totalPool) * 100).toFixed(1)) : 0,
      rawOdd: oddFmt(rawOdd),
      projectedOdd: oddFmt(projectedOdd),
      flooredAt1: r.pool > 0 && rawOdd < 1.0,
      projectedPayout: money(projectedPayout),
      // max(0, ...) só absorve ruído de ponto flutuante — matematicamente
      // payout <= totalPool em todos os ramos (ver invariante acima).
      projectedHouseGross: money(Math.max(0, totalPool - projectedPayout)),
    };
  });

  return {
    totalPool: money(totalPool),
    rakePercent,
    rakeNominal: money(rakeNominal),
    netPool: money(netPool),
    runners: projections,
  };
}

/**
 * Soma stake/tickets por odd direto do banco (fonte de verdade dos potes).
 * Cada aposta de multi-mercado tem exatamente 1 BetItem, então somar por
 * item não duplica stakes.
 */
export async function aggregatePoolsByOdd(
  prisma: PrismaService,
  oddIds: string[],
  statuses: BetStatus[],
): Promise<Map<string, { pool: number; tickets: number }>> {
  const map = new Map<string, { pool: number; tickets: number }>();
  if (oddIds.length === 0 || statuses.length === 0) return map;

  const rows = await prisma.$queryRaw<Array<{ oddId: string; pool: Prisma.Decimal | null; tickets: bigint }>>`
    SELECT bi."oddId" as "oddId", SUM(b.stake) as pool, COUNT(*) as tickets
    FROM "BetItem" bi
    JOIN "Bet" b ON b.id = bi."betId"
    WHERE bi."oddId" IN (${Prisma.join(oddIds)})
      AND b.status::text IN (${Prisma.join(statuses)})
    GROUP BY bi."oddId"
  `;

  for (const row of rows) {
    map.set(row.oddId, {
      pool: Number(row.pool ?? 0),
      tickets: Number(row.tickets),
    });
  }
  return map;
}
