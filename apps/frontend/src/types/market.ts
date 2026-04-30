export type MarketSnapshot = {
  duelId: string;
  eventId: string;
  eventName: string;
  eventStartAt: string;
  marketNames: string[];
  stageLabel: string;
  status: string;
  locked: boolean;
  lockedSide: 'LEFT' | 'RIGHT' | 'BOTH' | 'NONE';
  lockReason?: string;
  lockMessage?: string;
  totalPool: number;
  closeInSeconds: number;
  marginPercent: number;
  lockThresholdPercent: number;
  duel: {
    left: { id: string; label: string; odd: number; tickets: number; pool: number; locked: boolean };
    right: { id: string; label: string; odd: number; tickets: number; pool: number; locked: boolean };
  };
  history: Array<{
    at: string;
    leftOdd: number;
    rightOdd: number;
    leftPool: number;
    rightPool: number;
    lockedSide: 'LEFT' | 'RIGHT' | 'BOTH' | 'NONE';
    reason?: string;
  }>;
  settlement?: {
    winnerSide: 'LEFT' | 'RIGHT';
    winnerLabel: string;
    finalPool: number;
    finalOdd: number;
    settledAt: string;
  };
};

export type MultiRunnerSnapshot = {
  marketId: string;
  marketType: 'WINNER' | 'BEST_REACTION' | 'FALSE_START';
  eventId: string;
  eventName: string;
  marketName: string;
  status: string;
  totalPool: number;
  rakePercent: number;
  closeInSeconds: number;
  locked: boolean;
  lockMessage?: string;
  runners: Array<{
    oddId: string;
    label: string;
    odd: number;
    pool: number;
    tickets: number;
    locked: boolean;
    poolShare: number;
  }>;
  history: Array<{
    at: string;
    odds: Record<string, number>;
    totalPool: number;
  }>;
  settlement?: {
    winnerOddId: string;
    winnerLabel: string;
    finalPool: number;
    finalOdd: number;
    settledAt: string;
  };
};

export type BettingBoard = {
  events: Array<{
    id: string;
    name: string;
    startAt: string;
    status: string;
    marketNames: string[];
    currentDuelId: string | null;
    stages: Array<{
      duelId: string;
      label: string;
      startsAt: string;
      bookingCloseAt: string;
      status: string;
    }>;
  }>;
  generatedAt: string;
};
