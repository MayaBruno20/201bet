'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@admin/components/layout/sidebar';
import { Topbar } from '@admin/components/layout/topbar';
import { CmdK } from '@admin/components/ui/cmdk';
import { ToastProvider } from '@admin/components/ui/toast';
import { DrawerProvider } from '@admin/components/ui/drawer';
import { ConfirmProvider } from '@admin/components/ui/confirm';
import { useAdminSession } from '@admin/lib/use-admin-session';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const { ready, user } = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();

  // Auditor só pode ver o Modo Pista — qualquer outra rota redireciona pra /pista.
  const auditorLocked = ready && user?.role === 'AUDITOR' && !pathname.startsWith('/pista');
  React.useEffect(() => {
    if (auditorLocked) router.replace('/pista');
  }, [auditorLocked, router]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Enquanto valida a sessão (ou redireciona o auditor), mostra um placeholder mínimo.
  if (!ready || auditorLocked) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 text-[color:var(--text-3)] text-[13px]">
          <span className="pulse-dot" />
          Validando sessão…
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <DrawerProvider>
          <div className="flex h-dvh overflow-hidden">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed}
              mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
              openCmdK={() => setCmdkOpen(true)}/>
            <div className="flex-1 flex flex-col min-w-0">
              <Topbar openCmdK={() => setCmdkOpen(true)} openMobileNav={() => setMobileNavOpen(true)}/>
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
            <CmdK open={cmdkOpen} setOpen={setCmdkOpen}/>
          </div>
        </DrawerProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
