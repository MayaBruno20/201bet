/**
 * Bridge para minimizar mudanças nas páginas admin existentes.
 * Re-exporta tudo com os nomes antigos, mas apontando para os helpers admin.
 *
 * Em cada admin/page.tsx, basta trocar:
 *   from '@/lib/auth'         →  from '@/lib/admin-session-bridge'
 *   from '@/lib/api-request'  →  from '@/lib/admin-session-bridge'
 *
 * E o resto do código (que usa `apiFetch`, `getStoredUser`, etc.) continua funcionando.
 */
export { adminApiFetch as apiFetch } from './admin-api-request';
export {
  ADMIN_AUTH_USER_KEY as AUTH_USER_KEY,
  setStoredAdminUser as setStoredUser,
  getStoredAdminUser as getStoredUser,
  clearAdminClientSession as clearClientSession,
  logoutAdminSession as logoutSession,
  setStoredAdminAccessToken as setStoredAccessToken,
  getStoredAdminAccessToken as getStoredAccessToken,
  type AdminSessionUser as SessionUser,
} from './admin-auth';
