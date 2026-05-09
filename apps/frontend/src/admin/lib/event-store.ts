'use client';

import { useEffect, useState } from 'react';

const STORE_KEY = '201bet.events.v1';

export type CopaEvent = { id: string; name: string; cat: string; start: string; end: string; status: string; pilots: number; prize: number };
export type ArmaEvent = { id: string; name: string; rounds: number; elimRate: number; status: string; pilots: number; survivors: number; nextRound: string; prize: number };
export type CustomEvent = { id: string; name: string; desc: string; status: string; pilots: number; markets: number; prize: number };

export type EventStoreState = {
  copa: CopaEvent[];
  arma: ArmaEvent[];
  custom: CustomEvent[];
};

export type EventKind = keyof EventStoreState;

const defaultState: EventStoreState = {
  copa: [
    { id: 'c1', name: '2º Festival do Opala', cat: 'TUDOKIDÁ', start: '2026-05-15T19:00', end: '2026-05-16T02:00', status: 'AO VIVO', pilots: 22, prize: 25000 },
    { id: 'c2', name: 'Copa Categorias SP · 9s', cat: '9s', start: '2026-05-22T20:00', end: '2026-05-22T23:59', status: 'AGENDADO', pilots: 16, prize: 12000 },
  ],
  arma: [
    { id: 'a1', name: 'Armageddon Sul · 8s', rounds: 6, elimRate: 33, status: 'AO VIVO', pilots: 142, survivors: 38, nextRound: '21:00', prize: 50000 },
    { id: 'a2', name: 'Armageddon Nordeste · 9s', rounds: 5, elimRate: 40, status: 'AGENDADO', pilots: 96, survivors: 96, nextRound: '—', prize: 30000 },
  ],
  custom: [
    { id: 'p1', name: 'Desafio Opala vs Maverick', desc: 'Confronto direto, melhor de 5', status: 'AGENDADO', pilots: 8, markets: 3, prize: 8000 },
  ],
};

function loadStore(): EventStoreState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch { return defaultState; }
}

function saveStore(s: EventStoreState) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}

export function useEventStore() {
  const [state, setState] = useState<EventStoreState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setState(loadStore()); setHydrated(true); }, []);
  useEffect(() => { if (hydrated) saveStore(state); }, [state, hydrated]);

  const add = <K extends EventKind>(kind: K, evt: Omit<EventStoreState[K][number], 'id'> & { id?: string }) =>
    setState((s) => ({ ...s, [kind]: [{ ...(evt as object), id: `${String(kind)[0]}${Date.now()}` } as EventStoreState[K][number], ...s[kind]] }));
  const update = <K extends EventKind>(kind: K, id: string, patch: Partial<EventStoreState[K][number]>) =>
    setState((s) => ({ ...s, [kind]: s[kind].map((e) => (e.id === id ? { ...e, ...patch } : e)) as EventStoreState[K] }));
  const remove = <K extends EventKind>(kind: K, id: string) =>
    setState((s) => ({ ...s, [kind]: s[kind].filter((e) => e.id !== id) as EventStoreState[K] }));
  const reset = () => setState(defaultState);

  return { state, add, update, remove, reset, hydrated };
}
