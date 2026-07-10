/**
 * Verifica na VALUT se um depósito PENDING foi realmente PAGO e, opcionalmente,
 * CONFIRMA o depósito (credita o valor na carteira + marca o pagamento APPROVED).
 *
 * Resolve o caso "paguei mas o saldo não entrou" (depósito travado em PENDING pelo
 * bug do webhook/reconciliador): consulta a Valut e, se pago, credita igual ao
 * fluxo normal.
 *
 * PRÉ-REQUISITO: QUOTAGUARDSTATIC_URL (proxy estático da prod) no .env. Sem ele a
 * Valut recusa a consulta com 403 (o IP local não está na whitelist).
 *
 * USO (em apps/backend):
 *   # 1) Só CONSULTA (read-only) — diz se o PIX foi pago, não credita nada:
 *   npx ts-node scripts/confirmar-deposito.ts <email | cpf | pix_id>
 *
 *   # 2) CONFIRMA — se estiver pago, credita o valor + marca APPROVED:
 *   npx ts-node scripts/confirmar-deposito.ts <email | cpf | pix_id> --confirmar
 *
 * Ex.:
 *   npx ts-node scripts/confirmar-deposito.ts glealb22@gmail.com
 *   npx ts-node scripts/confirmar-deposito.ts glealb22@gmail.com --confirmar
 *
 * SEGURANÇA:
 *   - IDEMPOTENTE: o crédito usa claim atômico (só credita depósito PENDING). Rodar
 *     2x NÃO duplica saldo.
 *   - Só credita se a Valut disser paid=true E is_refunded=false.
 *   - Espelha o confirmDeposit (payments.service.ts) — inclui o bônus de promo, se
 *     o usuário tiver campanha PENDING e o depósito atingir o mínimo.
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
import { PrismaClient, PaymentStatus, PaymentType, WalletTransactionType } from '@prisma/client';
import { ValutService } from '../src/payments/valut.service';

const prisma = new PrismaClient();
const valut = new ValutService();
const D = (x: any) => Number(x ?? 0);
const R = (x: any) => `R$${D(x).toFixed(2)}`;

/** Réplica fiel do confirmDeposit (payments.service.ts:186). Idempotente. */
async function confirmDeposit(paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING, type: PaymentType.DEPOSIT },
      data: { status: PaymentStatus.APPROVED },
    });
    const p = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new Error('Pagamento não encontrado');
    if (claimed.count === 0) {
      const w = await tx.wallet.findUnique({ where: { userId: p.userId } });
      return { skipped: true, status: p.status, balance: D(w?.balance), credited: 0, bonus: 0 };
    }
    const amount = p.amount;
    const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
    if (!wallet) throw new Error('Carteira não encontrada');
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    await tx.walletTransaction.create({
      data: { walletId: wallet.id, type: WalletTransactionType.DEPOSIT, amount, reference: `valut-pix-${p.providerRef ?? p.id}` },
    });
    let bonus = 0;
    const enr = await tx.promoEnrollment.findUnique({ where: { userId: p.userId }, include: { campaign: true } });
    if (enr && enr.bonusStatus === 'PENDING' && Number(amount) >= Number(enr.campaign.minDeposit)) {
      const cb = await tx.promoEnrollment.updateMany({
        where: { id: enr.id, bonusStatus: 'PENDING' },
        data: { bonusStatus: 'GRANTED', bonusAmount: enr.campaign.bonusAmount, qualifyingPaymentId: p.id, bonusGrantedAt: new Date() },
      });
      if (cb.count === 1) {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: enr.campaign.bonusAmount } } });
        await tx.walletTransaction.create({ data: { walletId: wallet.id, type: WalletTransactionType.BONUS, amount: enr.campaign.bonusAmount, reference: `promo-bonus-${enr.id}` } });
        bonus = D(enr.campaign.bonusAmount);
      }
    }
    const updated = await tx.wallet.findUnique({ where: { id: wallet.id } });
    return { skipped: false, status: 'APPROVED', balance: D(updated!.balance), credited: D(amount), bonus };
  });
}

async function main() {
  const arg = (process.argv[2] ?? '').trim();
  const doConfirm = process.argv.includes('--confirmar');
  if (!arg) {
    console.log('Uso: npx ts-node scripts/confirmar-deposito.ts <email | cpf | pix_id> [--confirmar]');
    return;
  }
  if (!process.env.QUOTAGUARDSTATIC_URL) {
    console.log('⚠️  QUOTAGUARDSTATIC_URL não está no .env — a Valut vai recusar a consulta (403). Adicione o proxy da prod e rode de novo.');
    return;
  }

  // Resolve os depósitos PENDING alvo (por email/cpf → usuário; senão por pix_id/payment id)
  let deposits: { id: string; amount: any; providerRef: string | null; email?: string | null }[] = [];
  if (arg.includes('@') || arg.replace(/\D/g, '').length === 11) {
    const u = await prisma.user.findFirst({ where: arg.includes('@') ? { email: { equals: arg, mode: 'insensitive' } } : { cpf: arg.replace(/\D/g, '') } });
    if (!u) { console.log(`⚠️  Usuário não encontrado: ${arg}`); return; }
    const ds = await prisma.payment.findMany({ where: { userId: u.id, type: PaymentType.DEPOSIT, status: PaymentStatus.PENDING }, orderBy: { createdAt: 'asc' }, select: { id: true, amount: true, providerRef: true } });
    deposits = ds.map((d) => ({ ...d, email: u.email }));
    console.log(`Usuário ${u.email} | depósitos PENDING: ${ds.length}`);
  } else {
    const p = await prisma.payment.findFirst({ where: { OR: [{ providerRef: arg }, { id: arg }], type: PaymentType.DEPOSIT }, select: { id: true, amount: true, providerRef: true, status: true, user: { select: { email: true } } } });
    if (!p) { console.log(`⚠️  Depósito não encontrado por pix_id/id: ${arg}`); return; }
    if (p.status !== 'PENDING') { console.log(`Depósito ${p.id.slice(0, 8)} já está ${p.status} (não está pendente). Nada a fazer.`); return; }
    deposits = [{ id: p.id, amount: p.amount, providerRef: p.providerRef, email: p.user?.email }];
  }

  if (!deposits.length) { console.log('Nenhum depósito PENDING para verificar. ✓'); return; }

  let pagos = 0, creditados = 0;
  for (const d of deposits) {
    const tag = `${d.email ?? ''} | ${d.id.slice(0, 8)} | ${R(d.amount)}`;
    if (!d.providerRef) { console.log(`\n• ${tag} → sem providerRef, não dá pra consultar na Valut.`); continue; }
    let pix: { paid: boolean; status: string; amount: number; is_refunded?: boolean } | null = null;
    try {
      pix = await valut.getPixQrCode(d.providerRef);
    } catch (e) {
      console.log(`\n• ${tag} → ERRO na Valut: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const paid = pix.paid && !pix.is_refunded;
    console.log(`\n• ${tag}\n    Valut: paid=${pix.paid} status=${pix.status} valor=${R(pix.amount / 100)}${pix.is_refunded ? ' is_refunded=TRUE' : ''} → ${paid ? 'PAGO ✅' : 'NÃO PAGO/estornado ❌'}`);
    if (!paid) continue;
    pagos++;
    if (!doConfirm) { console.log(`    (dry-run) creditaria ${R(d.amount)}. Rode de novo com --confirmar para aplicar.`); continue; }
    const res = await confirmDeposit(d.id);
    if (res.skipped) console.log(`    já estava ${res.status} (não duplicou). saldo ${R(res.balance)}.`);
    else { creditados++; console.log(`    ✅ CREDITADO ${R(res.credited)}${res.bonus ? ` + bônus ${R(res.bonus)}` : ''} → saldo ${R(res.balance)} | depósito APPROVED.`); }
  }

  console.log(`\n=== resumo: ${deposits.length} verificado(s) | ${pagos} pago(s)${doConfirm ? ` | ${creditados} creditado(s)` : ' | (dry-run, nada creditado)'} ===`);
  if (pagos && !doConfirm) console.log('Para creditar os pagos, rode de novo com --confirmar.');
}

main()
  .catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
