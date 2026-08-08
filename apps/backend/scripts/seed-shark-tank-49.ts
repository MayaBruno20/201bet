/**
 * Cria o evento "SHARK TANK 49ª EDIÇÃO | LISTA ÁREA 43" (ArmageddonEvent
 * bracketType SHARK_TANK) + Event de apostas vinculado, cadastra os 32 pilotos
 * nas 4 chaves (A-D, 8 cada) e GERA o chaveamento (4 chaves 8→4→2→1 + os 4
 * desafios da Fase Final, com os ponteiros de avanço resolvidos).
 *
 * MODOS (em apps/backend):
 *   npx ts-node scripts/seed-shark-tank-49.ts --sql    # imprime o SQL (colar no psql do Coolify) — NÃO conecta no banco
 *   npx ts-node scripts/seed-shark-tank-49.ts --apply  # aplica via Prisma (precisa de DATABASE_URL acessível)
 *   npx ts-node scripts/seed-shark-tank-49.ts          # dry-run (checa se já existe)
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
loadEnv({ path: path.resolve(__dirname, '../../../.env') });
import { randomUUID } from 'crypto';
import { buildSharkTankBracket } from '../src/armageddon/armageddon-bracket.util';

const EVENT_NAME = 'SHARK TANK 49ª EDIÇÃO | LISTA ÁREA 43';
const SCHEDULED_AT = '2026-08-08T12:00:00.000Z'; // ajuste se precisar

type Pilot = { pos: number; name: string; car: string };
const BRACKETS: Record<'A' | 'B' | 'C' | 'D', Pilot[]> = {
  A: [
    { pos: 1, name: 'CHAVINSKY', car: 'GOL' },
    { pos: 2, name: 'LEO TORKIN', car: 'VOYAGE' },
    { pos: 3, name: 'MARCELO', car: 'GOL DOURADO' },
    { pos: 4, name: 'EDUARDO', car: 'AUDI S3' },
    { pos: 5, name: 'SAMARA BENATTO', car: 'GOL PRETO' },
    { pos: 6, name: 'CABOS', car: 'GOL' },
    { pos: 7, name: 'DAVID CRU', car: '' },
    { pos: 8, name: 'ANDRÉ LUIZ', car: 'PASSAT' },
  ],
  B: [
    { pos: 1, name: 'PEDRO SABINO', car: 'CHEVETTE' },
    { pos: 2, name: 'WERIK RODRIGUES', car: 'GOL G4' },
    { pos: 3, name: 'RENAN ROMAGNOLLI', car: 'CHEVETTE' },
    { pos: 4, name: 'VINNY ELETRIC SYSTEM', car: 'GOL' },
    { pos: 5, name: 'FERNANDO', car: 'X5 DIESEL' },
    { pos: 6, name: 'BRUNO CONSOLARA', car: 'BMW' },
    { pos: 7, name: 'CLAYTON MAIA', car: 'GOL FLD' },
    { pos: 8, name: 'GLAUCIO BRUNINI', car: 'CHEVETTE' },
  ],
  C: [
    { pos: 1, name: 'ANDRÉ KANEDA', car: 'JETTA' },
    { pos: 2, name: 'LUIS GUILHERME', car: 'GOL' },
    { pos: 3, name: 'RODRIGO BAILON', car: 'GOL 4X4' },
    { pos: 4, name: 'CARLOS ROMANHOLI', car: 'GOL' },
    { pos: 5, name: 'RODRIGO AZEVEDO', car: 'GOL G2' },
    { pos: 6, name: 'RUBISNEI PAULINO', car: 'FUSCA' },
    { pos: 7, name: 'ROBSON CUSTÓDIO', car: 'GOL BX' },
    { pos: 8, name: 'JHONES GABRIEL', car: 'GOL G4' },
  ],
  D: [
    { pos: 1, name: 'EDUARDO SANTOS', car: 'GOL' },
    { pos: 2, name: 'EDUARDO RAMOS', car: 'VOYAGE' },
    { pos: 3, name: 'ANDRÉ PESSI', car: 'GOL 4X4' },
    { pos: 4, name: 'RODRIGO PORTUGAL', car: 'GOL' },
    { pos: 5, name: 'LUIZ ALBERTO JR', car: 'MAVERICK' },
    { pos: 6, name: 'ALEX VENTRILHO', car: 'GOL' },
    { pos: 7, name: 'ALEXANDRE KARKAÇA', car: 'OPALA' },
    { pos: 8, name: 'PAULO PENNA', car: 'GOL 4X4' },
  ],
};

const KEYS = ['A', 'B', 'C', 'D'] as const;
const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const nn = (v: string | null) => (v == null || v === '' ? 'NULL' : sq(v));

/** Monta o plano (ids + linhas) usado tanto pelo --sql quanto pelo --apply. */
function buildPlan() {
  const eventUuid = randomUUID();
  const armaUuid = randomUUID();

  const drivers: Array<{ id: string; name: string; car: string }> = [];
  const roster: Array<{ id: string; driverId: string; key: string; pos: number }> = [];
  const driverAt = new Map<string, string>(); // `${key}:${pos}` -> driverId
  for (const key of KEYS) {
    for (const p of BRACKETS[key]) {
      const id = randomUUID();
      drivers.push({ id, name: p.name, car: p.car });
      roster.push({ id: randomUUID(), driverId: id, key, pos: p.pos });
      driverAt.set(`${key}:${p.pos}`, id);
    }
  }

  const specs = buildSharkTankBracket();
  const idByKey = new Map<string, string>();
  for (const s of specs) idByKey.set(s.key, randomUUID());
  const matchups = specs.map((s) => ({
    id: idByKey.get(s.key)!,
    stage: s.stage,
    bracketKey: s.bracketKey,
    roundNumber: s.roundNumber,
    order: s.order,
    leftPosition: s.leftPosition,
    rightPosition: s.rightPosition,
    leftDriverId: s.leftPosition != null ? driverAt.get(`${s.bracketKey}:${s.leftPosition}`) ?? null : null,
    rightDriverId: s.rightPosition != null ? driverAt.get(`${s.bracketKey}:${s.rightPosition}`) ?? null : null,
    nextMatchupId: s.nextKey ? idByKey.get(s.nextKey) ?? null : null,
    nextSlotSide: s.nextSlotSide,
    loserToMatchupId: s.loserKey ? idByKey.get(s.loserKey) ?? null : null,
    loserToSlotSide: s.loserSlotSide,
    isThirdPlace: s.isThirdPlace,
    isFinal: s.isFinal,
  }));

  return { eventUuid, armaUuid, drivers, roster, matchups };
}

function emitSql() {
  const p = buildPlan();
  const L: string[] = [];
  L.push('BEGIN;');
  L.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "ArmageddonEvent" WHERE name = ${sq(EVENT_NAME)} AND "bracketType" = 'SHARK_TANK') THEN RAISE EXCEPTION 'Shark Tank 49 ja existe'; END IF; END $$;`);
  L.push(
    `INSERT INTO "Event" (id, sport, name, "startAt", status, "createdAt", "updatedAt") VALUES (${sq(p.eventUuid)}, 'DRAG_RACE', ${sq(EVENT_NAME)}, ${sq(SCHEDULED_AT)}, 'SCHEDULED', now(), now());`,
  );
  L.push(
    `INSERT INTO "ArmageddonEvent" (id, name, format, "bracketType", "scheduledAt", status, "eventId", featured, "createdAt", "updatedAt") VALUES (${sq(p.armaUuid)}, ${sq(EVENT_NAME)}, 'TOP_20', 'SHARK_TANK', ${sq(SCHEDULED_AT)}, 'IN_PROGRESS', ${sq(p.eventUuid)}, false, now(), now());`,
  );
  const dById = new Map(p.drivers.map((d) => [d.id, d]));
  for (const d of p.drivers) {
    L.push(
      `INSERT INTO "Driver" (id, name, team, active, "isGuest", "createdAt", "updatedAt") VALUES (${sq(d.id)}, ${sq(d.name)}, ${nn(d.car)}, true, false, now(), now());`,
    );
  }
  for (const r of p.roster) {
    L.push(
      `INSERT INTO "ArmageddonRoster" (id, "eventId", "driverId", "bracketKey", position, "isKing", "createdAt", "updatedAt") VALUES (${sq(r.id)}, ${sq(p.armaUuid)}, ${sq(r.driverId)}, ${sq(r.key)}, ${r.pos}, false, now(), now());`,
    );
    void dById;
  }
  for (const m of p.matchups) {
    L.push(
      `INSERT INTO "ArmageddonMatchup" (id, "eventId", stage, "bracketKey", "roundNumber", "order", "leftPosition", "rightPosition", "leftDriverId", "rightDriverId", "nextMatchupId", "nextSlotSide", "loserToMatchupId", "loserToSlotSide", "isThirdPlace", "isFinal", "marketOpen", "createdAt", "updatedAt") VALUES (` +
        `${sq(m.id)}, ${sq(p.armaUuid)}, ${sq(m.stage)}, ${m.bracketKey ? sq(m.bracketKey) : 'NULL'}, ${m.roundNumber}, ${m.order}, ` +
        `${m.leftPosition ?? 'NULL'}, ${m.rightPosition ?? 'NULL'}, ${m.leftDriverId ? sq(m.leftDriverId) : 'NULL'}, ${m.rightDriverId ? sq(m.rightDriverId) : 'NULL'}, ` +
        `${m.nextMatchupId ? sq(m.nextMatchupId) : 'NULL'}, ${m.nextSlotSide ? sq(m.nextSlotSide) : 'NULL'}, ${m.loserToMatchupId ? sq(m.loserToMatchupId) : 'NULL'}, ${m.loserToSlotSide ? sq(m.loserToSlotSide) : 'NULL'}, ` +
        `${m.isThirdPlace}, ${m.isFinal}, false, now(), now());`,
    );
  }
  L.push('COMMIT;');
  console.log(L.join('\n'));
  console.error(`\n-- ${p.drivers.length} pilotos · ${p.matchups.length} embates (chaves + Fase Final) · evento ${p.armaUuid}`);
}

async function applyPrisma() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.armageddonEvent.findFirst({
      where: { name: EVENT_NAME, bracketType: 'SHARK_TANK' as never },
    });
    if (existing) {
      console.log(`>> Já existe (id ${existing.id}). Abortando.`);
      return;
    }
    const p = buildPlan();
    await prisma.$transaction(async (tx) => {
      await tx.event.create({ data: { id: p.eventUuid, sport: 'DRAG_RACE', name: EVENT_NAME, startAt: new Date(SCHEDULED_AT), status: 'SCHEDULED' as never } });
      await tx.armageddonEvent.create({ data: { id: p.armaUuid, name: EVENT_NAME, format: 'TOP_20' as never, bracketType: 'SHARK_TANK' as never, scheduledAt: new Date(SCHEDULED_AT), status: 'IN_PROGRESS' as never, eventId: p.eventUuid } });
      for (const d of p.drivers) await tx.driver.create({ data: { id: d.id, name: d.name, team: d.car || null } });
      await tx.armageddonRoster.createMany({ data: p.roster.map((r) => ({ id: r.id, eventId: p.armaUuid, driverId: r.driverId, bracketKey: r.key, position: r.pos })) });
      await tx.armageddonMatchup.createMany({ data: p.matchups.map((m) => ({
        id: m.id, eventId: p.armaUuid, stage: m.stage as never, bracketKey: m.bracketKey, roundNumber: m.roundNumber, order: m.order,
        leftPosition: m.leftPosition, rightPosition: m.rightPosition, leftDriverId: m.leftDriverId, rightDriverId: m.rightDriverId,
        nextMatchupId: m.nextMatchupId, nextSlotSide: m.nextSlotSide as never, loserToMatchupId: m.loserToMatchupId, loserToSlotSide: m.loserToSlotSide as never,
        isThirdPlace: m.isThirdPlace, isFinal: m.isFinal,
      })) });
    }, { timeout: 60000, maxWait: 15000 });
    console.log(`>> Criado: evento ${p.armaUuid} (Event ${p.eventUuid}) · ${p.drivers.length} pilotos · ${p.matchups.length} embates.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.argv.includes('--sql')) { emitSql(); return; }
  if (process.argv.includes('--apply')) { await applyPrisma(); return; }
  // dry-run
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.armageddonEvent.findFirst({ where: { name: EVENT_NAME, bracketType: 'SHARK_TANK' as never } });
    console.log(existing ? `Já existe (id ${existing.id}).` : 'Não existe ainda. Rode com --sql (terminal) ou --apply (túnel).');
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error('ERRO:', e); process.exit(1); });
