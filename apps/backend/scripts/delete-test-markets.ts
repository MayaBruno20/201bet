/**
 * Hard-delete cirúrgico de mercados de teste — SEM REFUND de carteira.
 *
 * Uso:
 *   Dry-run (mostra o que seria apagado):
 *     npx ts-node scripts/delete-test-markets.ts
 *
 *   Executar de verdade:
 *     npx ts-node scripts/delete-test-markets.ts --confirm
 *
 * Edite o array PATTERNS abaixo para mirar mercados diferentes.
 * Match é case-insensitive em Market.name (formato "Driver A x Driver B").
 *
 * O que apaga:
 *   - AffiliateCommission relacionado às bets desses mercados
 *   - BetItem dos Odds desses mercados
 *   - Bets que ficaram sem nenhum BetItem (órfãs)
 *   - Odds dos mercados
 *   - DuelPoolState (se o Duel ficar sem outros mercados)
 *   - Markets
 *
 * O que NÃO mexe (intencional):
 *   - Wallet / WalletTransaction → saldo do usuário fica como está, sem refund
 *   - Duel → mantido porque pode estar referenciado por ListMatchup / CategoryMatchup
 *   - Event → mantido (admin lida com ele depois pelo painel)
 */

import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Padrões de nome de mercado a serem apagados.
// Market.name segue o padrão "Driver A x Driver B" — `contains` insensível ao caso.
const PATTERNS = ['Robson', 'Chairon'];

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('🗑️  Hard-delete de mercados de teste (sem refund)');
  console.log(confirm ? '   ⚠️  EXECUTANDO em modo real' : '   (dry-run — nenhuma alteração será feita)');
  console.log('   Padrões:', PATTERNS.join(', '));
  console.log();

  const markets = await prisma.market.findMany({
    where: {
      OR: PATTERNS.map((p) => ({ name: { contains: p, mode: 'insensitive' as const } })),
    },
    include: {
      event: { select: { name: true } },
      odds: {
        select: {
          id: true,
          label: true,
          betItems: { select: { id: true, betId: true } },
        },
      },
    },
  });

  if (markets.length === 0) {
    console.log('Nenhum mercado encontrado pelos padrões. Nada a fazer.');
    return;
  }

  console.log(`Encontrados ${markets.length} mercado(s):\n`);
  for (const m of markets) {
    const betIds = new Set(m.odds.flatMap((o) => o.betItems.map((bi) => bi.betId)));
    const itemCount = m.odds.flatMap((o) => o.betItems).length;
    console.log(`  • ${m.name}`);
    console.log(`    evento: ${m.event.name}`);
    console.log(`    status: ${m.status}  |  duelId: ${m.duelId ?? '—'}`);
    console.log(`    odds: ${m.odds.length}  |  bet items: ${itemCount}  |  bets únicas: ${betIds.size}`);
    console.log();
  }

  if (!confirm) {
    console.log('Re-rode com --confirm para apagar de verdade.');
    return;
  }

  for (const m of markets) {
    const oddIds = m.odds.map((o) => o.id);
    const betIds = [...new Set(m.odds.flatMap((o) => o.betItems.map((bi) => bi.betId)))];

    await prisma.$transaction(async (tx) => {
      // 1. AffiliateCommissions ligadas a essas bets ou ao próprio mercado
      const afDeleted = await tx.affiliateCommission.deleteMany({
        where: { OR: [{ marketId: m.id }, { betId: { in: betIds } }] },
      });

      // 2. BetItems dos odds desse mercado
      const biDeleted = await tx.betItem.deleteMany({
        where: { oddId: { in: oddIds } },
      });

      // 3. Bets que ficaram sem nenhum item (provavelmente todas, já que sua única peça era esse mercado)
      let betsDeleted = 0;
      for (const betId of betIds) {
        const remaining = await tx.betItem.count({ where: { betId } });
        if (remaining === 0) {
          await tx.bet.delete({ where: { id: betId } });
          betsDeleted += 1;
        }
      }

      // 4. Odds
      const oddsDeleted = await tx.odd.deleteMany({ where: { marketId: m.id } });

      // 5. Market
      await tx.market.delete({ where: { id: m.id } });

      // 6. DuelPoolState órfão (Duel só some se nenhum outro mercado o referencia)
      let poolStateDeleted = 0;
      let duelDeleted = false;
      if (m.duelId) {
        const otherMarkets = await tx.market.count({ where: { duelId: m.duelId } });
        if (otherMarkets === 0) {
          const r = await tx.duelPoolState.deleteMany({ where: { duelId: m.duelId } });
          poolStateDeleted = r.count;
          // Tenta deletar o Duel — se algum ListMatchup/CategoryMatchup ainda referencia,
          // o Prisma vai bloquear (Restrict) e a gente preserva o Duel.
          try {
            await tx.duel.delete({ where: { id: m.duelId } });
            duelDeleted = true;
          } catch {
            duelDeleted = false;
          }
        }
      }

      // 7. Audit log
      await tx.auditLog.create({
        data: {
          action: 'TEST_MARKET_HARD_DELETE',
          entity: 'Market',
          entityId: m.id,
          payload: {
            name: m.name,
            eventName: m.event.name,
            counts: {
              affiliateCommissions: afDeleted.count,
              betItems: biDeleted.count,
              bets: betsDeleted,
              odds: oddsDeleted.count,
              poolStates: poolStateDeleted,
              duelDeleted,
            },
          } as Prisma.InputJsonValue,
        },
      });

      console.log(
        `  ✓ ${m.name} apagado · bets=${betsDeleted} itens=${biDeleted.count} odds=${oddsDeleted.count} ` +
        `commission=${afDeleted.count} duel=${duelDeleted ? 'apagado' : 'mantido'}`,
      );
    });
  }

  console.log('\n✅ Concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
