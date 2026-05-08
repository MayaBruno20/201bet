/**
 * Catálogo de endpoints do backend. Use ao invés de strings literais.
 *
 *   import { ENDPOINTS } from '@admin/lib/endpoints';
 *   await api.get(ENDPOINTS.USERS.list);
 *   await api.patch(ENDPOINTS.USERS.update(userId), { name: 'novo' });
 */

export const ENDPOINTS = {
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
    create: '/admin/markets',
    settle: (id: string) => `/admin/markets/${id}/settle`,
    void: (id: string) => `/admin/markets/${id}/void`,
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
    },
    rosters: {
      upsert: (listId: string) => `/admin/brazil-lists/${listId}/roster`,
      delete: (listId: string, rosterId: string) => `/admin/brazil-lists/${listId}/roster/${rosterId}`,
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
    roster: {
      importFromLists: (eventId: string) => `/admin/armageddon/${eventId}/roster/import-from-lists`,
      upsert: (eventId: string) => `/admin/armageddon/${eventId}/roster`,
      clear: (eventId: string) => `/admin/armageddon/${eventId}/roster`,
      delete: (eventId: string, rosterId: string) => `/admin/armageddon/${eventId}/roster/${rosterId}`,
    },
    matchups: {
      generate: (eventId: string) => `/admin/armageddon/${eventId}/generate-matchups`,
      toggleMarket: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}/market`,
      settle: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}/settle`,
      delete: (matchupId: string) => `/admin/armageddon/matchups/${matchupId}`,
    },
  },

  QUICK_DUELS: {
    list: '/admin/quick-duels',
    create: '/admin/quick-duels',
    closeBooking: (id: string) => `/admin/quick-duels/${id}/close-booking`,
    settle: (id: string) => `/admin/quick-duels/${id}/settle`,
    cancel: (id: string) => `/admin/quick-duels/${id}/cancel`,
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
    margin: '/admin/config/margin',
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
  },

  AUDIT: {
    list: '/admin/audit-logs',
  },
} as const;
