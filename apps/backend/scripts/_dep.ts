import { config as loadEnv } from 'dotenv'; import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
import { PrismaClient, PaymentType, PaymentStatus, WalletTransactionType } from '@prisma/client';
const prisma = new PrismaClient();
const D = (x:any)=>Number(x??0);
(async () => {
  // 1) distribuição de status dos DEPÓSITOS
  const byStatus = await prisma.payment.groupBy({ by:['status'], where:{ type:PaymentType.DEPOSIT }, _count:{_all:true}, _sum:{amount:true} });
  console.log('=== DEPÓSITOS por status ===');
  for (const s of byStatus) console.log(`  ${s.status}: ${s._count._all} (R$${D(s._sum.amount).toFixed(2)})`);

  // 2) Cross-check global: soma de depósitos APPROVED vs soma das WalletTransactions tipo DEPOSIT
  const appSum = await prisma.payment.aggregate({ where:{type:PaymentType.DEPOSIT,status:PaymentStatus.APPROVED}, _sum:{amount:true}, _count:{_all:true} });
  const txSum = await prisma.walletTransaction.aggregate({ where:{type:WalletTransactionType.DEPOSIT}, _sum:{amount:true}, _count:{_all:true} });
  console.log(`\n=== Cross-check ===`);
  console.log(`  Depósitos APPROVED: ${appSum._count._all} = R$${D(appSum._sum.amount).toFixed(2)}`);
  console.log(`  WalletTx DEPOSIT:   ${txSum._count._all} = R$${D(txSum._sum.amount).toFixed(2)}`);
  console.log(`  GAP (approved - creditado): R$${(D(appSum._sum.amount)-D(txSum._sum.amount)).toFixed(2)}`);

  // 3) Depósitos APPROVED SEM WalletTransaction de crédito correspondente (reference=payment.id)
  const approved = await prisma.payment.findMany({ where:{type:PaymentType.DEPOSIT,status:PaymentStatus.APPROVED, amount:{gt:0}},
    select:{ id:true, amount:true, provider:true, providerRef:true, createdAt:true, userId:true, user:{select:{email:true,wallet:{select:{id:true}}}} }, orderBy:{createdAt:'desc'} });
  const semCredito:any[]=[];
  for (const p of approved) {
    const tx = await prisma.walletTransaction.findFirst({ where:{ type:WalletTransactionType.DEPOSIT, reference:p.id } });
    if (!tx) {
      // fallback: tenta achar por walletId+valor (caso a reference seja outra convenção)
      const alt = p.user?.wallet ? await prisma.walletTransaction.findFirst({ where:{ walletId:p.user.wallet.id, type:WalletTransactionType.DEPOSIT, amount:p.amount } }) : null;
      if (!alt) semCredito.push(p);
    }
  }
  console.log(`\n=== APPROVED sem crédito na carteira: ${semCredito.length} ===`);
  for (const p of semCredito.slice(0,15)) console.log(`  ${p.createdAt.toISOString().slice(0,16)} | ${p.user?.email} | R$${D(p.amount).toFixed(2)} | ${p.provider} | ref=${p.providerRef ?? 'null'} | pay=${p.id.slice(0,8)}`);

  // 4) PENDING e UNKNOWN (presos)
  for (const st of [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] as const) {
    const rows = await prisma.payment.findMany({ where:{type:PaymentType.DEPOSIT,status:st, amount:{gt:0}}, select:{amount:true,createdAt:true,provider:true,providerRef:true,user:{select:{email:true}}}, orderBy:{createdAt:'desc'} });
    const sum = rows.reduce((s,r)=>s+D(r.amount),0);
    console.log(`\n=== ${st}: ${rows.length} depósitos (R$${sum.toFixed(2)}) ===`);
    for (const r of rows.slice(0,12)) console.log(`  ${r.createdAt.toISOString().slice(0,16)} | ${r.user?.email} | R$${D(r.amount).toFixed(2)} | ${r.provider} | ref=${r.providerRef ?? 'null'}`);
  }
  await prisma.$disconnect();
})();
