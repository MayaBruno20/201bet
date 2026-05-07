'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type AdminUser, fetchMe, getStoredAdminUser } from './auth';

/**
 * Hook que protege uma página: garante que existe sessão válida e retorna o user.
 * Enquanto valida, retorna `{ ready: false }` para você renderizar um spinner.
 *
 * Sessão inválida → redireciona para `/login`.
 *
 *   const { user, ready } = useAdminSession();
 *   if (!ready) return <Spinner />;
 *
 *   // Por role:
 *   const { user, ready } = useAdminSession({ requiredRoles: ['ADMIN'] });
 */
export function useAdminSession({ requiredRoles }: { requiredRoles?: AdminUser['role'][] } = {}) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = getStoredAdminUser();
      if (cached) setUser(cached);
      const me = await fetchMe();
      if (!alive) return;
      if (!me) {
        router.replace('/login');
        return;
      }
      if (requiredRoles && !requiredRoles.includes(me.role)) {
        router.replace('/dashboard'); // tem sessão mas role insuficiente — manda pro dashboard
        return;
      }
      setUser(me);
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, ready };
}
