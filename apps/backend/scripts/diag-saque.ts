/**
 * Diagnóstico READ-ONLY de "não consigo sacar".
 * Checa, para um usuário (email ou CPF), todos os bloqueios do createWithdraw.
 *
 * USO (em apps/backend):
 *   npx ts-node scripts/diag-saque.ts <email | cpf>
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
import { PrismaClient, PaymentStatus, PaymentType } from '@prisma/client';

const prisma = new PrismaClient();
const D = (x: any) => Number(x ?? 0);
const R = (x: any) => `R$ ${D(x).toFixed(2)}`;
const onlyDigits = (s: string) => s.replace(/\D/g, '');

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Passe email ou CPF.');

  const isCpf = onlyDigits(arg).length === 11 && !arg.includes('@');
  const user = await prisma.user.findFirst({
    where: isCpf
      ? { cpf: { in: [arg, onlyDigits(arg)] } }
      : { email: arg.trim().toLowerCase() },
    include: { wallet: true },
  });

  if (!user) {
    console.log(`\n❌ Nenhum usuário com ${isCpf ? 'CPF' : 'email'} = ${arg}`);
    // fallback: tenta achar por CPF só dígitos mesmo se veio email, e vice-versa
    const any = await prisma.user.findFirst({ where: { OR: [{ email: arg.trim().toLowerCase() }, { cpf: onlyDigits(arg) }] } });
    if (any) console.log('   (mas achei por outro campo — confira os dados)');
    return;
  }

  console.log(`\n=== USUÁRIO ===`);
  console.log(`nome:    ${user.name}`);
  console.log(`email:   ${user.email}  (verificado: ${user.emailVerified})`);
  console.log(`cpf:     ${user.cpf ?? '— (NULO)'}`);
  console.log(`nasc:    ${user.birthDate ? user.birthDate.toISOString().slice(0, 10) : '— (NULO)'}`);
  console.log(`status:  ${user.status}`);
  console.log(`saldo:   ${user.wallet ? R(user.wallet.balance) : '— (SEM CARTEIRA)'}`);

  const deposits = await prisma.payment.groupBy({
    by: ['status'],
    where: { userId: user.id, type: PaymentType.DEPOSIT },
    _count: true,
  });
  const approvedDeposits = deposits.find((d) => d.status === PaymentStatus.APPROVED)?._count ?? 0;

  const withdrawals = await prisma.payment.findMany({
    where: { userId: user.id, type: PaymentType.WITHDRAW },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  const pendingWithdrawals = withdrawals.filter(
    (w) => w.status === PaymentStatus.PENDING || w.status === PaymentStatus.UNKNOWN,
  );

  console.log(`\n=== DEPÓSITOS ===`);
  console.log(deposits.map((d) => `${d.status}: ${d._count}`).join(' | ') || 'nenhum');

  console.log(`\n=== SAQUES (8 recentes) ===`);
  if (withdrawals.length === 0) console.log('nenhum');
  for (const w of withdrawals) {
    console.log(
      `${w.createdAt.toISOString().slice(0, 16)}  ${w.status.padEnd(9)} ${R(w.amount).padEnd(12)} ` +
      `hold=${w.holdReason ?? '-'} pixType=${w.pixKeyType ?? '-'} pix=${w.pixKey ?? '-'} recvDoc=${w.receiverDocument ?? '-'}`,
    );
  }

  // ── Avaliação dos bloqueios (espelha createWithdraw) ──
  console.log(`\n=== BLOQUEIOS DE SAQUE ===`);
  const blocks: string[] = [];
  if (!user.wallet) blocks.push('SEM CARTEIRA → "Carteira não encontrada"');
  if (!user.cpf) blocks.push('CPF NULO → "Conclua CPF e data de nascimento antes de sacar."');
  if (approvedDeposits === 0) blocks.push('0 DEPÓSITOS APROVADOS → "Você precisa fazer pelo menos 1 depósito confirmado antes de solicitar saque."');
  if (pendingWithdrawals.length > 0) blocks.push(`${pendingWithdrawals.length} SAQUE(S) PENDENTE(S) → "Você já possui um saque pendente. Aguarde a confirmação..."`);
  if (user.status !== 'ACTIVE') blocks.push(`STATUS ${user.status} (fora do fluxo normal de conta ativa)`);

  if (blocks.length === 0) {
    console.log('✅ Nenhum bloqueio incondicional. Saque depende só de saldo suficiente e da chave PIX.');
    console.log(`   (saldo atual: ${user.wallet ? R(user.wallet.balance) : '—'})`);
  } else {
    blocks.forEach((b) => console.log(`⛔ ${b}`));
  }
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
