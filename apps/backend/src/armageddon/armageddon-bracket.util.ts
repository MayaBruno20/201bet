/**
 * Geradores de chaveamento do Armageddon ELIMINATION_144.
 *
 * 1º SORTEIO (5 chaves, eliminação simples, pareamento sequencial):
 *   - Chave A: 32 pilotos → 16 → 8 → 4 classificados (3 rodadas)
 *   - Chaves B,C,D,E: 28 pilotos → 14 → 7 classificados (2 rodadas)
 *   - Total de classificados: 4 + 7×4 = 32 (sem byes — 32 e 28 fecham limpos).
 *
 * 2º SORTEIO (chave única de 32, montada por arrasta-e-solta):
 *   32 → 16 → 8 → 4 (semi) → final. Os 2 perdedores da semi disputam o 3º lugar.
 *
 * O avanço é por PONTEIRO de árvore: cada embate aponta o vencedor para um slot
 * (next*) da próxima bateria. As semis também apontam o perdedor (loser*) para o
 * jogo de 3º lugar. Nada de "swap de ladder" aqui.
 */

export type Stage = 'FIRST_DRAW' | 'SECOND_DRAW';
export type Side = 'LEFT' | 'RIGHT';

/** Descrição lógica de um embate antes de persistir (ids vêm depois). */
export interface MatchupSpec {
  /** chave lógica única dentro do build, ex.: "A:1:3" ou "S:4:1" */
  key: string;
  stage: Stage;
  bracketKey: string | null; // "A".."E" no 1º sorteio; null no 2º
  roundNumber: number;
  order: number;
  /** posições do roster (1ª rodada do 1º sorteio) ou seeds 1..32 (1ª rodada do 2º). */
  leftPosition: number | null;
  rightPosition: number | null;
  /** vencedor avança para este embate/lado */
  nextKey: string | null;
  nextSlotSide: Side | null;
  /** perdedor vai para este embate/lado (só semis → 3º lugar) */
  loserKey: string | null;
  loserSlotSide: Side | null;
  isThirdPlace: boolean;
  isFinal: boolean;
}

/** Tamanho e cota de classificados de cada chave do 1º sorteio. */
export const FIRST_DRAW_KEYS: ReadonlyArray<{ key: string; size: number; qualifiers: number }> = [
  { key: 'A', size: 32, qualifiers: 4 },
  { key: 'B', size: 28, qualifiers: 7 },
  { key: 'C', size: 28, qualifiers: 7 },
  { key: 'D', size: 28, qualifiers: 7 },
  { key: 'E', size: 28, qualifiers: 7 },
];

export const TOTAL_PILOTS = FIRST_DRAW_KEYS.reduce((s, k) => s + k.size, 0); // 144
export const SECOND_DRAW_SIZE = FIRST_DRAW_KEYS.reduce((s, k) => s + k.qualifiers, 0); // 32

/**
 * Shark Tank: 4 chaves (A-D) de 8 pilotos, eliminação simples 8→4→2→1, um
 * finalista por chave. Os 4 finalistas vão pra Fase Final (4 desafios contra
 * pilotos do Top 20 da Lista, definidos manualmente no admin).
 */
export const SHARK_TANK_KEYS: ReadonlyArray<{ key: string; size: number; qualifiers: number }> = [
  { key: 'A', size: 8, qualifiers: 1 },
  { key: 'B', size: 8, qualifiers: 1 },
  { key: 'C', size: 8, qualifiers: 1 },
  { key: 'D', size: 8, qualifiers: 1 },
];

export const SHARK_TANK_TOTAL = SHARK_TANK_KEYS.reduce((s, k) => s + k.size, 0); // 32
export const SHARK_TANK_CHALLENGES = SHARK_TANK_KEYS.length; // 4

/**
 * Leva Tudo: 2 chaves (A-B) de 32, eliminação simples 32→16→8→4→2→1. A FINAL de
 * cada chave é a semifinal do torneio: o vencedor vai à Grande Final (Campeão/
 * Vice) e o perdedor ao 3º lugar. Total: 31×2 + final + 3º = 64 embates.
 */
export const LEVA_TUDO_KEYS: ReadonlyArray<{ key: string; size: number; qualifiers: number }> = [
  { key: 'A', size: 32, qualifiers: 1 },
  { key: 'B', size: 32, qualifiers: 1 },
];

export const LEVA_TUDO_TOTAL = LEVA_TUDO_KEYS.reduce((s, k) => s + k.size, 0); // 64

/** Config de chaves por tipo de bracket (p/ validação de roster e rótulos). */
export function keysForBracketType(
  bracketType: string,
): ReadonlyArray<{ key: string; size: number; qualifiers: number }> {
  if (bracketType === 'SHARK_TANK') return SHARK_TANK_KEYS;
  if (bracketType === 'LEVA_TUDO') return LEVA_TUDO_KEYS;
  return FIRST_DRAW_KEYS;
}

/** Tamanho máximo de roster de uma chave (p/ validar posição). */
export function bracketSize(
  bracketKey: string,
  keys: ReadonlyArray<{ key: string; size: number }> = FIRST_DRAW_KEYS,
): number | null {
  return keys.find((k) => k.key === bracketKey)?.size ?? null;
}

function sideFor(order: number): Side {
  return order % 2 === 1 ? 'LEFT' : 'RIGHT';
}

/**
 * Eliminação simples genérica: começa com `size` pilotos e gera rodadas (cada
 * uma com metade dos embates da anterior) até que o nº de vencedores da rodada
 * seja `stopAtWinners`. Liga os ponteiros de avanço (winner → próxima bateria).
 * Requer `size` par e que as divisões por 2 sejam inteiras até `stopAtWinners`.
 */
function buildSingleElim(
  bracketKey: string | null,
  stage: Stage,
  size: number,
  stopAtWinners: number,
): MatchupSpec[] {
  const prefix = stage === 'FIRST_DRAW' ? bracketKey : 'S';
  const specs: MatchupSpec[] = [];
  let round = 1;
  let count = size / 2; // embates nesta rodada
  while (true) {
    const terminal = count === stopAtWinners;
    for (let order = 1; order <= count; order++) {
      specs.push({
        key: `${prefix}:${round}:${order}`,
        stage,
        bracketKey,
        roundNumber: round,
        order,
        leftPosition: round === 1 ? 2 * order - 1 : null,
        rightPosition: round === 1 ? 2 * order : null,
        nextKey: terminal ? null : `${prefix}:${round + 1}:${Math.ceil(order / 2)}`,
        nextSlotSide: terminal ? null : sideFor(order),
        loserKey: null,
        loserSlotSide: null,
        isThirdPlace: false,
        isFinal: false,
      });
    }
    if (terminal) break;
    round += 1;
    count = count / 2;
  }
  return specs;
}

/** Gera os embates das 5 chaves do 1º sorteio (com ponteiros de avanço internos). */
export function buildArmageddonFirstDraw(): MatchupSpec[] {
  return FIRST_DRAW_KEYS.flatMap((k) =>
    buildSingleElim(k.key, 'FIRST_DRAW', k.size, k.qualifiers),
  );
}

/**
 * Gera a chave única de 32 do 2º sorteio + jogo de 3º lugar.
 * Rodadas: 1(16) → 2(8) → 3(4) → 4(semi, 2) → 5(final, 1). 3º lugar = round 5, order 2.
 * Os slots da 1ª rodada começam vazios (preenchidos pelo arrasta-e-solta).
 */
export function buildArmageddonSecondDraw(): MatchupSpec[] {
  const specs = buildSingleElim(null, 'SECOND_DRAW', SECOND_DRAW_SIZE, 1);
  const lastRound = Math.max(...specs.map((s) => s.roundNumber)); // 5
  const semiRound = lastRound - 1; // 4
  const thirdKey = `S:${lastRound}:2`;

  for (const s of specs) {
    if (s.roundNumber === lastRound && s.order === 1) s.isFinal = true;
    if (s.roundNumber === semiRound) {
      // perdedor da semi vai para o jogo de 3º lugar (semi #1 → LEFT, semi #2 → RIGHT)
      s.loserKey = thirdKey;
      s.loserSlotSide = s.order === 1 ? 'LEFT' : 'RIGHT';
    }
  }

  specs.push({
    key: thirdKey,
    stage: 'SECOND_DRAW',
    bracketKey: null,
    roundNumber: lastRound,
    order: 2,
    leftPosition: null,
    rightPosition: null,
    nextKey: null,
    nextSlotSide: null,
    loserKey: null,
    loserSlotSide: null,
    isThirdPlace: true,
    isFinal: false,
  });

  return specs;
}

/** Chave lógica do desafio da Fase Final de uma chave (idx 0..3). */
function sharkChallengeKey(index: number): string {
  return `F:1:${index + 1}`;
}

/**
 * Gera o chaveamento do SHARK_TANK:
 *   - 4 chaves (A-D) de 8, eliminação simples 8→4→2→1 (FIRST_DRAW).
 *   - O vencedor de cada chave avança (LEFT) para um desafio da Fase Final.
 *   - 4 desafios (SECOND_DRAW, round 1, order 1..4): LEFT = finalista (via avanço),
 *     RIGHT = piloto do Top 20 da Lista, preenchido manualmente no admin.
 * Não há final única nem 3º lugar — são 4 confrontos "toma a vaga" independentes.
 */
export function buildSharkTankBracket(): MatchupSpec[] {
  const specs: MatchupSpec[] = [];

  SHARK_TANK_KEYS.forEach((k, idx) => {
    const chave = buildSingleElim(k.key, 'FIRST_DRAW', k.size, k.qualifiers); // 8→4→2→1
    const terminal = chave.find((s) => s.nextKey === null);
    if (terminal) {
      terminal.nextKey = sharkChallengeKey(idx); // finalista vai pra Fase Final
      terminal.nextSlotSide = 'LEFT';
    }
    specs.push(...chave);
  });

  // Fase Final: 4 desafios (finalista x piloto da Lista definido no admin).
  for (let i = 0; i < SHARK_TANK_KEYS.length; i++) {
    specs.push({
      key: sharkChallengeKey(i),
      stage: 'SECOND_DRAW',
      bracketKey: null,
      roundNumber: 1,
      order: i + 1,
      leftPosition: null,
      rightPosition: null,
      nextKey: null,
      nextSlotSide: null,
      loserKey: null,
      loserSlotSide: null,
      isThirdPlace: false,
      isFinal: false,
    });
  }

  return specs;
}

/**
 * Gera o chaveamento do LEVA_TUDO:
 *   - 2 chaves (A-B) de 32, eliminação simples 32→16→8→4→2→1.
 *   - A FINAL de cada chave é a semifinal: vencedor → Grande Final (LEFT=A,
 *     RIGHT=B), perdedor → 3º lugar (LEFT=A, RIGHT=B).
 *   - Grande Final (isFinal) = Campeão/Vice. 3º lugar (isThirdPlace).
 * Total: 31×2 + final + 3º = 64 embates.
 */
export function buildLevaTudoBracket(): MatchupSpec[] {
  const specs: MatchupSpec[] = [];
  const grandFinalKey = 'F:1:1';
  const thirdKey = 'F:1:2';

  LEVA_TUDO_KEYS.forEach((k, idx) => {
    const chave = buildSingleElim(k.key, 'FIRST_DRAW', k.size, 1); // 32→…→1
    const terminal = chave.find((s) => s.nextKey === null); // final da chave = semifinal
    if (terminal) {
      const side: Side = idx === 0 ? 'LEFT' : 'RIGHT';
      terminal.nextKey = grandFinalKey; // vencedor da chave → Grande Final
      terminal.nextSlotSide = side;
      terminal.loserKey = thirdKey; // perdedor da semifinal → 3º lugar
      terminal.loserSlotSide = side;
    }
    specs.push(...chave);
  });

  // Grande Final (Campeão/Vice) — slots preenchidos por avanço.
  specs.push({
    key: grandFinalKey,
    stage: 'SECOND_DRAW',
    bracketKey: null,
    roundNumber: 1,
    order: 1,
    leftPosition: null,
    rightPosition: null,
    nextKey: null,
    nextSlotSide: null,
    loserKey: null,
    loserSlotSide: null,
    isThirdPlace: false,
    isFinal: true,
  });
  // 3º lugar — slots preenchidos pelos perdedores das semifinais.
  specs.push({
    key: thirdKey,
    stage: 'SECOND_DRAW',
    bracketKey: null,
    roundNumber: 1,
    order: 2,
    leftPosition: null,
    rightPosition: null,
    nextKey: null,
    nextSlotSide: null,
    loserKey: null,
    loserSlotSide: null,
    isThirdPlace: true,
    isFinal: false,
  });

  return specs;
}
