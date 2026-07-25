/**
 * Catálogo de endpoints do backend. Use ao invés de strings literais.
 *
 *   import { ENDPOINTS } from '@admin/lib/endpoints';
 *   await api.get(ENDPOINTS.USERS.list);
 *   await api.patch(ENDPOINTS.USERS.update(userId), { name: 'novo' });
 */

/** Monta a querystring de abrir/fechar mercados do Armageddon (chave/rodada/fase). */
function armaMarketQuery(opts?: { bracketKey?: string; roundNumber?: number; stage?: string }): string {
  if (!opts) return '';
  const qs = new URLSearchParams();
  if (opts.bracketKey) qs.set('bracketKey', opts.bracketKey);
  if (opts.roundNumber != null) qs.set('roundNumber', String(opts.roundNumber));
  if (opts.stage) qs.set('stage', opts.stage);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const ENDPOINTS = {
  // Upload de imagem persistido no banco → devolve { id, url: "/api/images/:id" }.
  IMAGES: {
    upload: '/admin/images',
  },
  PROMOTIONS: {
    list: '/admin/promotions',
    create: '/admin/promotions',
    update: (id: string) => `/admin/promotions/${id}`,
    delete: (id: string) => `/admin/promotions/${id}`,
    enrollments: (id: string) => `/admin/promotions/${id}/enrollments`,
  },
  AUTH: {
    login: '/admin/auth/login',
    login2fa: '/admin/auth/login/2fa',
    logout: '/admin/auth/logout',
    me: '/admin/auth/me',
    twoFa: {
      status: '/admin/auth/2fa/status',
      setup: '/admin/auth/2fa/setup',
      verify: '/admin/auth/2fa/verify',
      disable: '/admin/auth/2fa/disable',
      regenerateBackupCodes: '/admin/auth/2fa/regenerate-backup-codes',
    },
  },

  DASHBOARD: {
    summary: '/admin/dashboard',
    summaryFor: (days: number) => `/admin/dashboard?days=${days}`,
    liveProfit: '/admin/config/live-profit',
  },

  USERS: {
    list: '/admin/users',
    create: '/admin/users',
    update: (id: string) => `/admin/users/${id}`,
    delete: (id: string) => `/admin/users/${id}`,
    walletAdjust: (id: string) => `/admin/users/${id}/wallet-adjust`,
  },

  EVENTS: {
    list: '/admin/events',
    create: '/admin/events',
    update: (id: string) => `/admin/events/${id}`,
    delete: (id: string) => `/admin/events/${id}`,
  },

  DRIVERS: {
    list: '/admin/drivers',
    create: '/admin/drivers',
    bulkImport: '/admin/drivers/bulk-import',
    parseFile: '/admin/drivers/parse-file',
    deleteUnused: '/admin/drivers/delete-unused',
    update: (id: string) => `/admin/drivers/${id}`,
    delete: (id: string) => `/admin/drivers/${id}`,
  },

  CARS: {
    list: '/admin/cars',
    create: '/admin/cars',
    update: (id: string) => `/admin/cars/${id}`,
    delete: (id: string) => `/admin/cars/${id}`,
    uploadPhoto: (id: string) => `/admin/cars/${id}/photo`,
    deletePhoto: (id: string) => `/admin/cars/${id}/photo`,
  },

  DUELS: {
    list: '/admin/duels',
    create: '/admin/duels',
    update: (id: string) => `/admin/duels/${id}`,
    settle: (id: string) => `/admin/duels/${id}/settle`,
  },

  MARKETS: {
    list: '/admin/markets',
    live: '/admin/markets/live',
    create: '/admin/markets',
    // PATCH status/nome/fechamento — usado para pausar/reabrir multi-mercados.
    update: (id: string) => `/admin/markets/${id}`,
    // Fechamento financeiro: potes por opção, projeção por cenário, ganhadores.
    summary: (id: string) => `/admin/markets/${id}/summary`,
    settle: (id: string) => `/admin/markets/${id}/settle`,
    void: (id: string) => `/admin/markets/${id}/void`,
    // Reabre um mercado JÁ AUDITADO (estorna a liquidação). Rápido/personalizado/
    // multi/Copa/Lista. Armageddon usa ARMAGEDDON.matchups.reopen (cascata).
    reopen: (id: string) => `/admin/markets/${id}/reopen`,
    restartEvent: (eventId: string) => `/admin/events/${eventId}/restart`,
  },

  CATEGORY_EVENTS: {
    list: '/admin/category-events',
    create: '/admin/category-events',
    detail: (id: string) => `/admin/category-events/${id}`,
    update: (id: string) => `/admin/category-events/${id}`,
    delete: (id: string) => `/admin/category-events/${id}`,
    deleteHard: (id: string) => `/admin/category-events/${id}/hard`,
    brackets: {
      create: (eventId: string) => `/admin/category-events/${eventId}/brackets`,
      delete: (bracketId: string) => `/admin/category-events/brackets/${bracketId}`,
      size: (bracketId: string) => `/admin/category-events/brackets/${bracketId}/size`,
      saveLayout: (bracketId: string) => `/admin/category-events/brackets/${bracketId}/layout`,
      importCompetitors: (eventId: string) => `/admin/category-events/${eventId}/competitors/import`,
    },
    competitors: {
      upsert: (bracketId: string) => `/admin/category-events/brackets/${bracketId}/competitors`,
      update: (competitorId: string) => `/admin/category-events/competitors/${competitorId}`,
      delete: (competitorId: string) => `/admin/category-events/competitors/${competitorId}`,
    },
    matchups: {
      toggleMarket: (matchupId: string) => `/admin/category-events/matchups/${matchupId}/market`,
      settle: (matchupId: string) => `/admin/category-events/matchups/${matchupId}/settle`,
      cancel: (matchupId: string) => `/admin/category-events/matchups/${matchupId}/cancel`,
    },
    superFinal: {
      upsert: (bracketId: string) => `/admin/category-events/brackets/${bracketId}/super-final`,
    },
  },

  BRAZIL_LISTS: {
    list: '/admin/brazil-lists',
    create: '/admin/brazil-lists',
    detail: (id: string) => `/admin/brazil-lists/${id}`,
    update: (id: string) => `/admin/brazil-lists/${id}`,
    delete: (id: string) => `/admin/brazil-lists/${id}`,
    events: {
      // Criação ainda fica scoped no list, demais ops vão para /brazil-list-events
      create: (listId: string) => `/admin/brazil-lists/${listId}/events`,
      detail: (eventId: string) => `/admin/brazil-list-events/${eventId}`,
      update: (eventId: string) => `/admin/brazil-list-events/${eventId}`,
      delete: (eventId: string) => `/admin/brazil-list-events/${eventId}`,
      generateMatchups: (eventId: string) => `/admin/brazil-list-events/${eventId}/generate-matchups`,
      openAllMarkets: (eventId: string) => `/admin/brazil-list-events/${eventId}/open-all-markets`,
      closeAllMarkets: (eventId: string) => `/admin/brazil-list-events/${eventId}/close-all-markets`,
    },
    rosters: {
      upsert: (listId: string) => `/admin/brazil-lists/${listId}/roster`,
      delete: (listId: string, rosterId: string) => `/admin/brazil-lists/${listId}/roster/${rosterId}`,
      parseFile: (listId: string) => `/admin/brazil-lists/${listId}/roster/parse-file`,
      bulkReplace: (listId: string) => `/admin/brazil-lists/${listId}/roster/bulk-replace`,
    },
    sharkTank: {
      // SharkTank é per-EVENT no schema (listEventId), endpoints sob /brazil-list-events
      upsert: (eventId: string) => `/admin/brazil-list-events/${eventId}/shark-tank/entries`,
      update: (entryId: string) => `/admin/brazil-list-events/shark-tank/entries/${entryId}`,
      delete: (entryId: string) => `/admin/brazil-list-events/shark-tank/entries/${entryId}`,
    },
    matchups: {
      create: (eventId: string) => `/admin/brazil-list-events/${eventId}/matchups`,
      update: (matchupId: string) => `/admin/brazil-list-events/matchups/${matchupId}`,
      toggleMarket: (matchupId: string) => `/admin/brazil-list-events/matchups/${matchupId}/market`,
      settle: (matchupId: string) => `/admin/brazil-list-events/matchups/${matchupId}/settle`,
      delete: (matchupId: string) => `/admin/brazil-list-events/matchups/${matchupId}`,
    },
  },

  ARMAGEDDON: {
    list: '/admin/armageddon',
    create: '/admin/armageddon',
    detail: (id: string) => `/admin/armageddon/${id}`,
    update: (id: string) => `/admin/armageddon/${id}`,
    delete: (id: string) => `/admin/armageddon/${id}`,
    financialSummary: (id: string) => `/admin/armageddon/${id}/financial-summary`,
    driverSearch: (q: string) => `/admin/armageddon/drivers/search?q=${encodeURIComponent(q)}`,
    roster: {
      importFromLists: (eventId: string) => `/admin/armageddon/${eventId}/roster/import-from-lists`,
      upsert: (eventId: string) => `/admin/armageddon/${eventId}/roster`,
      clear: (eventId: string) => `/admin/armageddon/${eventId}/roster`,
      delete: (eventId: string, rosterId: string) => `/admin/armageddon/${eventId}/roster/${rosterId}`,
    },
    // Eliminação 144 (5 chaves → Top 32 → campeão + 3º lugar)
    generateFirstDraw: (eventId: string) => `/admin/armageddon/${eventId}/generate-first-draw`,
    generateSecondDraw: (eventId: string) => `/admin/armageddon/${eventId}/generate-second-draw`,
    clearKeys: (eventId: string) => `/admin/armageddon/${eventId}/clear-keys`,
    resetEvent: (eventId: string) => `/admin/armageddon/${eventId}/reset`,
    secondDrawLayout: (eventId: string) => `/admin/armageddon/${eventId}/second-draw-layout`,
    openAllReady: (eventId: string, opts?: { bracketKey?: string; roundNumber?: number; stage?: string }) =>
      `/admin/armageddon/${eventId}/open-all-ready${armaMarketQuery(opts)}`,
    closeAllOpen: (eventId: string, opts?: { bracketKey?: string; roundNumber?: number; stage?: string }) =>
      `/admin/armageddon/${eventId}/close-all-open${armaMarketQuery(opts)}`,
    matchups: {
      generate: (eventId: string) => `/admin/armageddon/${eventId}/generate-matchups`,
      toggleMarket: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}/market`,
      settle: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}/settle`,
      // Reabre bateria auditada revertendo o avanço de chave em cascata.
      reopen: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}/reopen`,
      delete: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}`,
    },
    // Multi-mercados (campeão / reação / queimada) sobre o Event vinculado.
    markets: {
      list: (eventId: string) => `/admin/armageddon/${eventId}/markets`,
      create: (eventId: string) => `/admin/armageddon/${eventId}/markets`,
    },
  },

  QUICK_DUELS: {
    list: '/admin/quick-duels',
    create: '/admin/quick-duels',
    closeBooking: (id: string) => `/admin/quick-duels/${id}/close-booking`,
    settle: (id: string) => `/admin/quick-duels/${id}/settle`,
    cancel: (id: string) => `/admin/quick-duels/${id}/cancel`,
  },

  CUSTOM_DUELS: {
    list: '/admin/custom-duels',
    create: '/admin/custom-duels',
    update: (id: string) => `/admin/custom-duels/${id}`,
    closeBooking: (id: string) => `/admin/custom-duels/${id}/close-booking`,
    settle: (id: string) => `/admin/custom-duels/${id}/settle`,
    cancel: (id: string) => `/admin/custom-duels/${id}/cancel`,
    uploadBanner: (id: string) => `/admin/custom-duels/${id}/banner`,
    deleteBanner: (id: string) => `/admin/custom-duels/${id}/banner`,
  },

  WITHDRAWALS: {
    listPending: '/admin/withdrawals/pending',
    approve: (paymentId: string) => `/admin/withdrawals/${paymentId}/approve`,
    reject: (paymentId: string) => `/admin/withdrawals/${paymentId}/reject`,
  },

  PAYMENTS: {
    deposits: (q: { status?: string; search?: string; limit?: number; offset?: number } = {}) => {
      const p = new URLSearchParams();
      if (q.status && q.status !== 'all') p.set('status', q.status);
      if (q.search) p.set('search', q.search);
      if (q.limit) p.set('limit', String(q.limit));
      if (q.offset) p.set('offset', String(q.offset));
      const qs = p.toString();
      return `/admin/payments/deposits${qs ? `?${qs}` : ''}`;
    },
    withdrawals: (q: { status?: string; search?: string; limit?: number; offset?: number } = {}) => {
      const p = new URLSearchParams();
      if (q.status && q.status !== 'all') p.set('status', q.status);
      if (q.search) p.set('search', q.search);
      if (q.limit) p.set('limit', String(q.limit));
      if (q.offset) p.set('offset', String(q.offset));
      const qs = p.toString();
      return `/admin/payments/withdrawals${qs ? `?${qs}` : ''}`;
    },
    summary: (hours = 24) => `/admin/payments/summary?hours=${hours}`,
  },

  DISCLAIMERS: {
    list: '/admin/disclaimers',
    create: '/admin/disclaimers',
    update: (id: string) => `/admin/disclaimers/${id}`,
    delete: (id: string) => `/admin/disclaimers/${id}`,
  },

  CONFIG: {
    // margin: fixa em 20% por regulamento, sem endpoint de alteração.
    minBet: '/admin/config/min-bet',
    settings: '/admin/settings',
    settingDelete: (id: string) => `/admin/settings/${id}`,
  },

  ANALYTICS: {
    overview: '/admin/analytics/overview',
    export: (type: 'users' | 'events' | 'bets' | 'transactions', format: 'json' | 'csv') =>
      `/admin/analytics/export?type=${type}&format=${format}`,
    eventsPerformance: '/admin/analytics/events-performance',
    profitSummary: '/admin/analytics/profit-summary',
    listEventFinancialClosing: (id: string) => `/admin/list-events/${id}/financial-closing`,
    armageddonEventFinancialClosing: (id: string) => `/admin/armageddon-events/${id}/financial-closing`,
    closingEligibleEvents: '/admin/analytics/closing-eligible-events',
  },

  AUDIT: {
    list: '/admin/audit-logs',
  },
} as const;
