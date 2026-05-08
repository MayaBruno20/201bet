# Admin 201bet — Next.js 16 (App Router)

Painel administrativo migrado de Vite + React Router para Next.js 16 com TypeScript.

## Stack
- Next.js 16 (App Router)
- React 19
- TypeScript (strict)
- Tailwind CSS 3
- Geist + Sora (Google Fonts)

## Estrutura

```
src/
├── app/
│   ├── layout.tsx                   ← root layout (importa globals.css)
│   ├── globals.css                  ← Tailwind + tokens de tema
│   ├── page.tsx                     ← redireciona para /dashboard
│   ├── login/page.tsx               ← rota pública
│   └── (protected)/
│       ├── layout.tsx               ← Sidebar + Topbar
│       ├── dashboard/page.tsx
│       ├── usuarios/page.tsx
│       ├── eventos/page.tsx
│       ├── pilotos/page.tsx
│       ├── armageddon/page.tsx
│       ├── listas/page.tsx
│       ├── personalizados/page.tsx
│       ├── auditoria/page.tsx
│       ├── relatorios/page.tsx
│       ├── market-control/page.tsx
│       └── seguranca/page.tsx
├── components/
│   ├── layout/{ sidebar, topbar }.tsx
│   └── ui/{ primitives, cmdk, drawer, toast, datepicker, icons }.tsx
└── lib/
    ├── data.ts                      ← mocks + fetchUsers / fetchEvents / etc
    └── event-store.ts               ← hook de estado persistente
```

## Rotas

| URL | Arquivo |
|---|---|
| `/login` | `app/login/page.tsx` |
| `/dashboard` | `app/(protected)/dashboard/page.tsx` |
| `/usuarios` | `app/(protected)/usuarios/page.tsx` |
| `/eventos` | `app/(protected)/eventos/page.tsx` |
| `/pilotos` | `app/(protected)/pilotos/page.tsx` |
| `/armageddon` | `app/(protected)/armageddon/page.tsx` |
| `/listas` | `app/(protected)/listas/page.tsx` |
| `/personalizados` | `app/(protected)/personalizados/page.tsx` |
| `/auditoria` | `app/(protected)/auditoria/page.tsx` |
| `/relatorios` | `app/(protected)/relatorios/page.tsx` |
| `/market-control` | `app/(protected)/market-control/page.tsx` |
| `/seguranca` | `app/(protected)/seguranca/page.tsx` |

`(protected)` é um *route group* — não aparece na URL, apenas agrupa rotas que compartilham o `layout.tsx` com Sidebar + Topbar.

## Camada de dados

`src/lib/data.ts` expõe funções nomeadas com mocks **prontas para serem trocadas por chamadas reais à API**:

```ts
fetchUsers(), fetchPilots(), fetchEvents(),
fetchBets(), fetchLists(), fetchActivity(),
fetchKpis(), fetchRevenue(), fetchEventTypes(),
fetchAuditLog()
```

Todas retornam `Promise<T[]>` com `await sleep(...)` simulando latência. Substitua o miolo por `fetch('/api/...').then(r => r.json())` quando integrar.

## Rodando

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — você é redirecionado para `/dashboard`.

## Notas de migração

- Removido `react-router-dom` (`BrowserRouter`, `Routes`, `useNavigate`).
- Navegação via `next/link` (`<Link href="/eventos">`) e `next/navigation` (`useRouter`, `usePathname`).
- Cada `page.tsx` começa com `'use client'` (forms, hooks, interatividade).
- Layout protegido em route group `(protected)` — adicione middleware de auth aqui depois.
- `unknown` em vez de `any` onde o tipo não é óbvio.
- Arquivos `.jsx` antigos foram convertidos 1:1 para `.tsx` com tipagem.
