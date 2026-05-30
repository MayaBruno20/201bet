import { Prisma } from '@prisma/client';

/**
 * Regra de troca de posições das Listas Brasil quando um embate é auditado.
 *
 * Convenção (ver buildBracketPairs): `leftPosition` é SEMPRE o desafiante
 * (rank pior, número maior) e `rightPosition` o defensor (rank melhor, número
 * menor). Se o desafiante (LEFT) vence, ele troca de posição com o defensor.
 * Se o defensor (RIGHT) vence, nada muda.
 *
 * Esta lógica é compartilhada por DOIS caminhos de liquidação:
 *   1. BrazilListsService.adminSettleMatchup  (botão "Auditar" da lista)
 *   2. SettlementService.settleMarket         (liquidação via mercado/duelo)
 * Antes, só o caminho (1) reordenava o roster — quando o admin liquidava pelo
 * mercado/duelo, o vencedor era gravado mas a Lista NÃO era reordenada.
 */

/** Campos mínimos de um ListMatchup necessários para decidir/aplicar a troca. */
export interface SwappableMatchup {
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriverId: string | null;
  rightDriverId: string | null;
  roundType: string;
}

/** True se o resultado deve disparar uma troca de posições no roster. */
export function shouldSwapOnSettle(
  matchup: SwappableMatchup,
  winnerSide: 'LEFT' | 'RIGHT' | null | undefined,
): boolean {
  return (
    winnerSide === 'LEFT' &&
    matchup.leftPosition != null &&
    matchup.rightPosition != null &&
    !!matchup.leftDriverId &&
    !!matchup.rightDriverId &&
    matchup.roundType !== 'SHARK_TANK'
  );
}

/**
 * Aplica a troca desafiante↔defensor no roster, em 3 passos, para não colidir
 * no índice único `@@unique([listId, position])`. Deve rodar dentro de uma
 * transação. Pressupõe que `shouldSwapOnSettle` já retornou true.
 */
export async function applyChallengerWinSwap(
  tx: Prisma.TransactionClient,
  params: {
    listId: string;
    challengerPos: number; // leftPosition  (rank pior)
    defenderPos: number; // rightPosition (rank melhor)
    challengerDriverId: string;
    defenderDriverId: string;
  },
): Promise<void> {
  const { listId, challengerPos, defenderPos, challengerDriverId, defenderDriverId } = params;

  // 1) parquear defensor em -1 (posição temp inexistente, sem colisão)
  await tx.listRoster.updateMany({
    where: { listId, driverId: defenderDriverId },
    data: { position: -1 },
  });
  // 2) mover challenger para a posição do defensor (agora livre)
  await tx.listRoster.updateMany({
    where: { listId, driverId: challengerDriverId },
    data: { position: defenderPos, isKing: defenderPos === 1 },
  });
  // 3) mover defensor de -1 para a posição do challenger (agora livre)
  await tx.listRoster.updateMany({
    where: { listId, driverId: defenderDriverId },
    data: { position: challengerPos, isKing: false },
  });
}
