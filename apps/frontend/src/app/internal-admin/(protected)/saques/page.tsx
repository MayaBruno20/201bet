'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Página antiga de "Saques" foi unificada com Depósitos em /financeiro.
 * Mantemos esse stub apenas para que URLs antigos / atalhos não quebrem —
 * redireciona pra aba "Solicitações de saque" do novo painel financeiro.
 */
export default function SaquesRedirectPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/financeiro');
  }, [router]);
  return (
    <div className="min-h-dvh grid place-items-center text-[13px] text-[color:var(--text-3)]">
      <div className="flex items-center gap-3">
        <span className="pulse-dot"/>
        Redirecionando para Financeiro…
      </div>
    </div>
  );
}
