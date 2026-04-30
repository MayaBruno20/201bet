/**
 * Limpeza de eventos e apostas.
 *
 * Apaga:
 *  - Todos os Bets, BetItems e AffiliateCommissions
 *  - Todas as WalletTransactions de tipo BET_PLACED / BET_WON / BET_REFUND
 *  - Todos os Markets, Odds, Duels, DuelPoolStates, Events
 *  - Todos os ListEvents (Brasil) + ListMatchups + SharkTankEntries
 *  - Todos os CategoryEvents (Copa) + Brackets + Competitors + Matchups
 *
 * Mantém:
 *  - Users, Wallets (saldo recomputado a partir de depositos/saques reais)
 *  - BrazilLists + ListRoster (master data)
 *  - Drivers + Cars (master data)
 *  - Affiliates
 *  - Payments (depositos/saques) e suas WalletTransactions
 *  - AuditLogs (historico)
 *
 * Uso:
 *   npx ts-node scripts/cleanup-events-bets.ts
 *
 * Para confirmar antes (dry-run):
 *   npx ts-node scripts/cleanup-events-bets.ts --dry
 */

import { config as loadEnv } from 'dotenv';
import path from 'path';
// Carrega .env do root do monorepo (../../../.env relativo a apps/backend/scripts)
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dry = process.argv.includes('--dry');

  console.log('🧹 Limpeza de eventos e apostas');
  console.log(dry ? '   (dry-run — nenhuma alteração será feita)' : '   ⚠️  EXECUTANDO em modo real');
  console.log();

  // 1) Conta o que existe antes
  const counts = {
    bets: await prisma.bet.count(),
    betItems: await prisma.betItem.count(),
    affiliateCommissions: await prisma.affiliateCommission.count(),
    betTransactions: await prisma.walletTransaction.count({
      where: { type: { in: ['BET_PLACED', 'BET_WON', 'BET_REFUND'] } },
    }),
    odds: await prisma.odd.count(),
    markets: await prisma.market.count(),
    duels: await prisma.duel.count(),
    duelPools: await prisma.duelPoolState.count(),
    events: await prisma.event.count(),
    listMatchups: await prisma.listMatchup.count(),
    sharkTankEntries: await prisma.sharkTankEntry.count(),
    listEvents: await prisma.listEvent.count(),
    categoryMatchups: await prisma.categoryMatchup.count(),
    categoryCompetitors: await prisma.categoryCompetitor.count(),
    categoryBrackets: await prisma.categoryBracket.count(),
    categoryEvents: await prisma.categoryEvent.count(),
  };

  console.log('📊 Estado atual:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(22)} = ${v}`);
  }
  console.log();

  if (dry) {
    console.log('Dry-run finalizado. Nenhuma alteração foi feita.');
    return;
  }

  // 2) Executa a limpeza em uma transacao
  console.log('🚀 Iniciando limpeza...');

  await prisma.$transaction(async (tx) => {
    // Ordem importa por causa de FKs
    await tx.affiliateCommission.deleteMany({});
    console.log('   ✓ AffiliateCommissions limpos');

    await tx.walletTransaction.deleteMany({
      where: { type: { in: ['BET_PLACED', 'BET_WON', 'BET_REFUND'] } },
    });
    console.log('   ✓ WalletTransactions de apostas limpos');

    await tx.betItem.deleteMany({});
    await tx.bet.deleteMany({});
    console.log('   ✓ Bets + BetItems limpos');

    // Brazil Lists
    await tx.sharkTankEntry.deleteMany({});
    await tx.listMatchup.deleteMany({});
    await tx.listEvent.deleteMany({});
    console.log('   ✓ ListEvents + matchups + shark tank limpos');

    // Copa Categorias
    await tx.categoryMatchup.deleteMany({});
    await tx.categoryCompetitor.deleteMany({});
    await tx.categoryBracket.deleteMany({});
    await tx.categoryEvent.deleteMany({});
    console.log('   ✓ CategoryEvents (Copa) + brackets + competidores + matchups limpos');

    // Markets/Odds
    await tx.odd.deleteMany({});
    await tx.market.deleteMany({});
    console.log('   ✓ Markets + Odds limpos');

    // Duels
    await tx.duelPoolState.deleteMany({});
    await tx.duel.deleteMany({});
    console.log('   ✓ Duels + DuelPoolStates limpos');

    // Events
    await tx.event.deleteMany({});
    console.log('   ✓ Events limpos');

    // Recompute wallet balances baseado nas transacoes restantes
    // (depositos APROVADOS, saques, ajustes admin, bonus, comissoes de afiliado)
    const wallets = await tx.wallet.findMany({ select: { id: true } });
    for (const w of wallets) {
      const result = await tx.walletTransaction.aggregate({
        where: { walletId: w.id },
        _sum: { amount: true },
      });
      const newBalance = result._sum.amount ?? 0;
      await tx.wallet.update({
        where: { id: w.id },
        data: { balance: newBalance },
      });
    }
    console.log(`   ✓ ${wallets.length} carteiras recalculadas (saldo = soma das transacoes restantes)`);
  }, { timeout: 60_000, maxWait: 10_000 });

  console.log();
  console.log('✅ Limpeza concluida.');
  console.log();

  // 3) Estado depois
  const after = {
    bets: await prisma.bet.count(),
    events: await prisma.event.count(),
    duels: await prisma.duel.count(),
    listEvents: await prisma.listEvent.count(),
    categoryEvents: await prisma.categoryEvent.count(),
  };
  console.log('📊 Estado pos-limpeza:');
  for (const [k, v] of Object.entries(after)) {
    console.log(`   ${k.padEnd(22)} = ${v}`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro durante limpeza:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
