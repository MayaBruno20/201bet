'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, SectionTitle, StatusChip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  twoFactor,
  type TwoFactorStatus,
  type TwoFactorSetupResponse,
  sessions as sessionsApi,
  type AdminSessionInfo,
  policies as policiesApi,
  type SecurityPolicies,
  loginAttempts as loginAttemptsApi,
  type LoginAttempt,
  type LoginAttemptSummary,
  getStoredAdminUser,
} from '@/lib/auth';

const REASON_LABEL: Record<string, string> = {
  invalid_password: 'Senha incorreta',
  invalid_2fa: 'Código 2FA inválido',
  rate_limited: 'Bloqueado por excesso',
  mfa_required: '2FA obrigatório',
  forbidden_role: 'Sem permissão admin',
  unknown_user_or_inactive: 'E-mail inexistente / inativo',
  success: 'Sucesso',
};

function timeSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Desconhecido';
  // Heurística simples — só pra dar uma dica visual.
  let device = 'Browser';
  if (/iPhone|iPad|iOS/.test(ua)) device = 'iOS';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Mac OS X|Macintosh/.test(ua)) device = 'macOS';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/Linux/.test(ua)) device = 'Linux';
  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return browser ? `${device} · ${browser}` : device;
}

export default function SegurancaPage() {
  const { push } = useToast();
  const confirm = useConfirm();
  const me = getStoredAdminUser();
  const isSuperAdmin = me?.role === 'ADMIN';

  // ── 2FA do admin logado ──
  const [tfStatus, setTfStatus] = React.useState<TwoFactorStatus | null>(null);
  const [tfSetup, setTfSetup] = React.useState<TwoFactorSetupResponse | null>(null);
  const [tfVerifyCode, setTfVerifyCode] = React.useState('');
  const [tfBackupCodes, setTfBackupCodes] = React.useState<string[] | null>(null);
  const [tfBusy, setTfBusy] = React.useState(false);
  const [tfDisablePassword, setTfDisablePassword] = React.useState('');
  const [tfDisableCode, setTfDisableCode] = React.useState('');
  const [tfRegenCode, setTfRegenCode] = React.useState('');

  const loadTfStatus = React.useCallback(async () => {
    try { setTfStatus(await twoFactor.status()); } catch { /* ignore */ }
  }, []);
  React.useEffect(() => { void loadTfStatus(); }, [loadTfStatus]);

  // ── Políticas de segurança ──
  const [policies, setPolicies] = React.useState<SecurityPolicies | null>(null);
  const [policyDraft, setPolicyDraft] = React.useState<SecurityPolicies | null>(null);
  const [policyBusy, setPolicyBusy] = React.useState(false);

  const loadPolicies = React.useCallback(async () => {
    try {
      const p = await policiesApi.get();
      setPolicies(p);
      setPolicyDraft(p);
    } catch (e) { push({ title: 'Erro ao carregar políticas', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  }, [push]);
  React.useEffect(() => { void loadPolicies(); }, [loadPolicies]);

  const policyDirty = React.useMemo(() => {
    if (!policies || !policyDraft) return false;
    return (
      policies.mfaRequired !== policyDraft.mfaRequired ||
      policies.sessionTimeoutHours !== policyDraft.sessionTimeoutHours ||
      policies.passwordMinLength !== policyDraft.passwordMinLength ||
      policies.maxLoginAttempts !== policyDraft.maxLoginAttempts ||
      policies.loginAttemptWindowMin !== policyDraft.loginAttemptWindowMin
    );
  }, [policies, policyDraft]);

  const savePolicies = async () => {
    if (!policyDraft || !policyDirty) return;
    setPolicyBusy(true);
    try {
      const next = await policiesApi.update(policyDraft);
      setPolicies(next);
      setPolicyDraft(next);
      push({ title: 'Políticas atualizadas', tone: 'emerald' });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setPolicyBusy(false); }
  };

  // ── Sessões ──
  const [mySessions, setMySessions] = React.useState<AdminSessionInfo[]>([]);
  const [allSessions, setAllSessions] = React.useState<AdminSessionInfo[]>([]);
  const [sessionsTab, setSessionsTab] = React.useState<'mine' | 'all'>('mine');
  const [sessionBusy, setSessionBusy] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    try {
      setMySessions(await sessionsApi.listMine());
      if (isSuperAdmin) setAllSessions(await sessionsApi.listAll());
    } catch (e) { push({ title: 'Erro ao carregar sessões', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  }, [push, isSuperAdmin]);
  React.useEffect(() => { void loadSessions(); }, [loadSessions]);

  const revokeSession = async (s: AdminSessionInfo) => {
    if (s.current) {
      const ok = await confirm({
        title: 'Encerrar SUA sessão atual?',
        body: 'Você será deslogado imediatamente e voltará pra tela de login.',
        tone: 'warning',
        confirmLabel: 'Encerrar e sair',
      });
      if (!ok) return;
    }
    setSessionBusy(s.id);
    try {
      await sessionsApi.revoke(s.id);
      push({ title: 'Sessão encerrada', tone: 'amber' });
      if (s.current) {
        window.location.href = '/login';
        return;
      }
      await loadSessions();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setSessionBusy(null); }
  };

  const forceLogoutGlobal = async () => {
    const ok = await confirm({
      title: 'Forçar logout global?',
      body: 'Vai encerrar TODAS as sessões admin ativas, exceto a sua. Os outros operadores precisarão logar novamente.',
      tone: 'danger',
      confirmLabel: 'Forçar logout',
      icon: 'Shield',
    });
    if (!ok) return;
    try {
      const { revoked } = await sessionsApi.revokeAll();
      push({ title: `${revoked} sessões encerradas`, tone: 'amber' });
      await loadSessions();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  // ── Login attempts ──
  const [attemptsSummary, setAttemptsSummary] = React.useState<LoginAttemptSummary | null>(null);
  const [attempts, setAttempts] = React.useState<LoginAttempt[]>([]);
  const [attemptsHours, setAttemptsHours] = React.useState(24);
  const [attemptsOnlyFailures, setAttemptsOnlyFailures] = React.useState(true);

  const loadAttempts = React.useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        loginAttemptsApi.summary(attemptsHours),
        loginAttemptsApi.list({ hours: attemptsHours, onlyFailures: attemptsOnlyFailures }),
      ]);
      setAttemptsSummary(s);
      setAttempts(list);
    } catch (e) { push({ title: 'Erro ao carregar tentativas', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  }, [attemptsHours, attemptsOnlyFailures, push]);
  React.useEffect(() => { void loadAttempts(); }, [loadAttempts]);

  // ── 2FA actions ──
  const startTfSetup = async () => {
    setTfBusy(true);
    try { setTfSetup(await twoFactor.setup()); setTfBackupCodes(null); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : 'Falha ao iniciar 2FA', tone: 'amber' }); }
    finally { setTfBusy(false); }
  };
  const confirmTfSetup = async () => {
    if (!tfVerifyCode.trim()) return;
    setTfBusy(true);
    try {
      const { backupCodes } = await twoFactor.verify(tfVerifyCode);
      setTfBackupCodes(backupCodes); setTfSetup(null); setTfVerifyCode('');
      await loadTfStatus();
      push({ title: '2FA ativado', body: 'Salve os backup codes em local seguro.', tone: 'emerald' });
    } catch (e) { push({ title: 'Código inválido', body: e instanceof Error ? e.message : '', tone: 'amber' }); }
    finally { setTfBusy(false); }
  };
  const disableTf = async () => {
    if (!tfDisablePassword || !tfDisableCode) return;
    const ok = await confirm({
      title: 'Desativar 2FA?',
      body: 'Sua conta passa a depender só da senha para login. Operação auditada e ações financeiras passam a ter risco extra.',
      tone: 'danger',
      confirmLabel: 'Desativar 2FA',
      icon: 'Shield',
    });
    if (!ok) return;
    setTfBusy(true);
    try {
      await twoFactor.disable(tfDisablePassword, tfDisableCode);
      setTfDisablePassword(''); setTfDisableCode('');
      await loadTfStatus();
      push({ title: '2FA desativado', tone: 'amber' });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'amber' }); }
    finally { setTfBusy(false); }
  };
  const regenBackupCodes = async () => {
    if (!tfRegenCode.trim()) return;
    setTfBusy(true);
    try {
      const { backupCodes } = await twoFactor.regenerateBackupCodes(tfRegenCode);
      setTfBackupCodes(backupCodes); setTfRegenCode('');
      await loadTfStatus();
      push({ title: 'Backup codes regenerados', body: 'Os anteriores foram invalidados.', tone: 'emerald' });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'amber' }); }
    finally { setTfBusy(false); }
  };

  const sessionsToShow = sessionsTab === 'mine' ? mySessions : allSessions;

  return (
    <Page eyebrow="Sistema" title="Segurança"
      sub="2FA, políticas, sessões e tentativas de login. Tudo conectado ao backend."
      actions={isSuperAdmin ? (
        <button className="btn btn-primary focusable" onClick={forceLogoutGlobal}>
          <I.Shield size={15}/> Forçar logout global
        </button>
      ) : undefined}>

      {/* ── 2FA do admin logado ── */}
      <Card className="p-5 mb-5" style={{
        border: '1px solid ' + (tfStatus?.enabled ? 'rgba(33, 217, 122, 0.3)' : 'rgba(255, 176, 40, 0.3)'),
        background: tfStatus?.enabled ? 'rgba(33, 217, 122, 0.04)' : 'rgba(255, 176, 40, 0.04)',
      }}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-11 h-11 rounded-[12px] grid place-items-center shrink-0"
            style={{ background: tfStatus?.enabled ? 'var(--emerald-soft)' : 'var(--accent-soft)', color: tfStatus?.enabled ? 'var(--emerald)' : 'var(--accent)' }}>
            <I.Shield size={20}/>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="font-display text-[18px] font-bold">Sua autenticação em 2 etapas</div>
            <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">
              {tfStatus === null ? 'Carregando…' :
                tfStatus.enabled
                  ? `Ativada · ${tfStatus.backupCodesRemaining} backup code(s) restantes.`
                  : 'Sua conta NÃO tem 2FA. Recomendado ativar agora.'}
            </div>
          </div>
          {tfStatus !== null && !tfStatus.enabled && !tfSetup && (
            <button onClick={startTfSetup} disabled={tfBusy} className="btn btn-primary"><I.Plus size={14}/> Ativar 2FA</button>
          )}
        </div>

        {tfSetup && (
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="grid md:grid-cols-[200px_1fr] gap-5 items-start">
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tfSetup.qrPng} alt="QR code 2FA" className="rounded-[12px] bg-white" style={{ width: 200, height: 200 }}/>
                <div className="text-[10.5px] text-[color:var(--text-3)] text-center">Escaneie no Google Authenticator, Authy, 1Password…</div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-1">Secret manual</div>
                  <code className="block text-[11px] font-mono break-all p-2 rounded-[8px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>{tfSetup.secret}</code>
                </div>
                <div>
                  <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-1">Confirme com o primeiro código</div>
                  <input className="input text-center font-mono text-[18px] tracking-widest" value={tfVerifyCode} onChange={(e) => setTfVerifyCode(e.target.value)} placeholder="123456" inputMode="numeric"/>
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmTfSetup} disabled={tfBusy || !tfVerifyCode.trim()} className="btn btn-primary"><I.Check size={14}/> Confirmar e ativar</button>
                  <button onClick={() => { setTfSetup(null); setTfVerifyCode(''); }} className="btn btn-ghost">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tfBackupCodes && (
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <I.Bolt size={16} style={{ color: 'var(--accent)' }}/>
              <div className="font-semibold text-[14px]" style={{ color: 'var(--accent)' }}>Salve estes backup codes AGORA</div>
            </div>
            <p className="text-[11.5px] text-[color:var(--text-2)] mb-3">
              Cada code só funciona 1 vez. <strong>Esta tela não vai aparecer de novo.</strong>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {tfBackupCodes.map((c) => (
                <div key={c} className="rounded-[8px] px-2 py-1.5 font-mono text-center text-[12px]" style={{ background: 'var(--surface-2)' }}>{c}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard.writeText(tfBackupCodes.join('\n'))} className="btn btn-ghost"><I.Download size={14}/> Copiar todos</button>
              <button onClick={() => setTfBackupCodes(null)} className="btn btn-primary"><I.Check size={14}/> Já salvei</button>
            </div>
          </div>
        )}

        {tfStatus?.enabled && !tfSetup && !tfBackupCodes && (
          <div className="mt-5 pt-5 grid md:grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">Regenerar backup codes</div>
              <div className="flex gap-2">
                <input className="input flex-1" value={tfRegenCode} onChange={(e) => setTfRegenCode(e.target.value)} placeholder="Código TOTP atual" inputMode="numeric"/>
                <button onClick={regenBackupCodes} disabled={tfBusy || !tfRegenCode.trim()} className="btn btn-ghost">Regenerar</button>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">Desativar 2FA</div>
              <div className="flex flex-col gap-2">
                <input type="password" className="input" value={tfDisablePassword} onChange={(e) => setTfDisablePassword(e.target.value)} placeholder="Sua senha"/>
                <div className="flex gap-2">
                  <input className="input flex-1" value={tfDisableCode} onChange={(e) => setTfDisableCode(e.target.value)} placeholder="Código TOTP" inputMode="numeric"/>
                  <button onClick={disableTf} disabled={tfBusy || !tfDisablePassword || !tfDisableCode} className="btn"
                    style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
                    Desativar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-12 gap-5">
        {/* ── Políticas (esquerda) ── */}
        <div className="col-span-12 lg:col-span-7 space-y-5">
          <Card className="p-5">
            <SectionTitle
              title="Políticas de segurança"
              sub={isSuperAdmin ? 'Aplicam para todo o time admin' : 'Apenas Super Admin pode editar'}
              action={policyDirty ? (
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={() => policies && setPolicyDraft(policies)} disabled={policyBusy}>
                    Descartar
                  </button>
                  <button className="btn btn-primary" onClick={savePolicies} disabled={policyBusy || !isSuperAdmin}>
                    {policyBusy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Salvar</>}
                  </button>
                </div>
              ) : undefined}/>
            {!policyDraft ? (
              <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Carregando…</div>
            ) : (
              <div className="space-y-2 mt-3">
                <PolicyToggleRow
                  label="Exigir 2FA para todos os admins"
                  desc={policyDraft.mfaRequired ? 'Sem 2FA, login admin é bloqueado.' : 'Login admin permitido sem 2FA.'}
                  enabled={policyDraft.mfaRequired}
                  critical
                  onToggle={() => setPolicyDraft((d) => d ? ({ ...d, mfaRequired: !d.mfaRequired }) : d)}
                  disabled={!isSuperAdmin}
                />
                <PolicyNumberRow
                  label="Sessão expira em"
                  unit="horas"
                  value={policyDraft.sessionTimeoutHours}
                  min={1} max={168}
                  desc="Tempo de vida do JWT do painel admin. Aplica em novos logins."
                  onChange={(v) => setPolicyDraft((d) => d ? ({ ...d, sessionTimeoutHours: v }) : d)}
                  disabled={!isSuperAdmin}
                />
                <PolicyNumberRow
                  label="Senha mínima"
                  unit="caracteres"
                  value={policyDraft.passwordMinLength}
                  min={6} max={64}
                  desc="Validação aplicada ao criar/atualizar contas admin."
                  critical
                  onChange={(v) => setPolicyDraft((d) => d ? ({ ...d, passwordMinLength: v }) : d)}
                  disabled={!isSuperAdmin}
                />
                <PolicyNumberRow
                  label="Tentativas máximas de login"
                  unit="falhas"
                  value={policyDraft.maxLoginAttempts}
                  min={3} max={100}
                  desc={`Bloqueia o IP/email após N falhas em ${policyDraft.loginAttemptWindowMin} min.`}
                  critical
                  onChange={(v) => setPolicyDraft((d) => d ? ({ ...d, maxLoginAttempts: v }) : d)}
                  disabled={!isSuperAdmin}
                />
                <PolicyNumberRow
                  label="Janela de tentativas"
                  unit="minutos"
                  value={policyDraft.loginAttemptWindowMin}
                  min={1} max={1440}
                  desc="Período no qual as falhas contam para o bloqueio."
                  onChange={(v) => setPolicyDraft((d) => d ? ({ ...d, loginAttemptWindowMin: v }) : d)}
                  disabled={!isSuperAdmin}
                />
              </div>
            )}
          </Card>

          {/* ── Sessões ativas ── */}
          <Card className="p-5">
            <SectionTitle
              title="Sessões ativas"
              sub={`${(sessionsTab === 'mine' ? mySessions.length : allSessions.length)} ${sessionsTab === 'mine' ? 'da sua conta' : 'da equipe admin'}`}
              action={isSuperAdmin && (
                <div className="flex gap-1">
                  <button onClick={() => setSessionsTab('mine')} className={`tab ${sessionsTab === 'mine' ? 'active' : ''}`}>Minhas</button>
                  <button onClick={() => setSessionsTab('all')} className={`tab ${sessionsTab === 'all' ? 'active' : ''}`}>Todas</button>
                </div>
              )}/>
            {sessionsToShow.length === 0 ? (
              <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhuma sessão ativa.</div>
            ) : (
              <div className="space-y-2 mt-3">
                {sessionsToShow.map((s) => (
                  <div key={s.id} className="surface-2 p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                      <I.Bolt size={15}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[13px]">{parseUserAgent(s.userAgent)}</div>
                        {s.current && <StatusChip status="Atual"/>}
                        {s.user && <span className="text-[11px] text-[color:var(--text-3)] font-mono">{s.user.email}</span>}
                      </div>
                      <div className="text-[11px] text-[color:var(--text-3)] mt-0.5 font-mono">
                        {s.ipAddress ?? 'IP desconhecido'} · ativa há {timeSince(s.lastSeenAt)} · criada {timeSince(s.createdAt)} atrás
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={() => revokeSession(s)}
                      disabled={sessionBusy === s.id}
                      style={{ color: '#ff7585' }}
                    >
                      <I.X size={13}/> Encerrar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Tentativas de login (direita) ── */}
        <div className="col-span-12 lg:col-span-5 space-y-5">
          <Card className="p-5">
            <SectionTitle
              title="Tentativas de login"
              sub={attemptsSummary
                ? `${attemptsSummary.failures} falhas · ${attemptsSummary.successes} sucessos · últimas ${attemptsSummary.hours}h`
                : 'Carregando…'}
              action={
                <select
                  className="input"
                  style={{ width: 110 }}
                  value={attemptsHours}
                  onChange={(e) => setAttemptsHours(Number(e.target.value))}
                >
                  <option value={1}>1h</option>
                  <option value={24}>24h</option>
                  <option value={168}>7 dias</option>
                  <option value={720}>30 dias</option>
                </select>
              }/>

            <label className="flex items-center gap-2 mt-3 text-[12.5px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={attemptsOnlyFailures}
                onChange={(e) => setAttemptsOnlyFailures(e.target.checked)}
              />
              Mostrar apenas falhas/bloqueios
            </label>

            {attemptsSummary && attemptsSummary.topIps.length > 0 && (
              <div className="mt-4">
                <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">
                  Top IPs com falhas
                </div>
                <div className="space-y-1.5">
                  {attemptsSummary.topIps.slice(0, 5).map((row) => (
                    <div key={row.ip ?? 'null'} className="surface-2 p-2 flex items-center gap-2 text-[11.5px]">
                      <div className="font-mono font-semibold flex-1">{row.ip ?? '—'}</div>
                      <span className="chip" style={{ background: 'var(--rose-soft)', color: '#ff7585' }}>
                        {row.attempts} falhas
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">
                Últimas tentativas
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-auto">
                {attempts.length === 0 ? (
                  <div className="text-[12px] text-[color:var(--text-3)] py-3 text-center">
                    Nada nas últimas {attemptsHours}h.
                  </div>
                ) : attempts.map((a) => (
                  <div key={a.id} className="surface-2 p-2.5 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-[8px] grid place-items-center shrink-0 mt-0.5"
                      style={{
                        background: a.success ? 'var(--emerald-soft)' : 'var(--rose-soft)',
                        color: a.success ? 'var(--emerald)' : 'var(--rose)',
                      }}>
                      {a.success ? <I.Check size={12}/> : <I.X size={12}/>}
                    </div>
                    <div className="flex-1 min-w-0 text-[11.5px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-mono font-semibold truncate">{a.email ?? '—'}</div>
                        <span className="chip" style={{
                          background: a.success ? 'var(--emerald-soft)' : 'var(--rose-soft)',
                          color: a.success ? 'var(--emerald)' : '#ff7585',
                        }}>
                          {REASON_LABEL[a.reason ?? ''] ?? a.reason ?? (a.success ? 'OK' : 'Falha')}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[color:var(--text-3)] mt-0.5 font-mono">
                        {a.ipAddress ?? '—'} · {timeSince(a.createdAt)} atrás
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

const PolicyToggleRow: React.FC<{
  label: string;
  desc?: string;
  enabled: boolean;
  critical?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ label, desc, enabled, critical, disabled, onToggle }) => (
  <div className="surface-2 p-3 flex items-center gap-3">
    <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0"
      style={{ background: enabled ? 'var(--accent-soft)' : 'var(--surface-3)', color: enabled ? 'var(--accent)' : 'var(--text-3)' }}>
      {enabled ? <I.Check size={15}/> : <I.X size={15}/>}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-[13px]">{label}</div>
        {critical && <span className="chip" style={{ background: 'var(--rose-soft)', color: '#ff7585' }}>crítico</span>}
      </div>
      {desc && <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{desc}</div>}
    </div>
    <button
      onClick={onToggle}
      disabled={disabled}
      className="relative shrink-0"
      style={{ width: 38, height: 22, borderRadius: 99, background: enabled ? 'var(--accent)' : 'var(--surface-3)', transition: 'background 0.2s', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span style={{ position: 'absolute', top: 2, left: enabled ? 18 : 2, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left 0.2s' }}/>
    </button>
  </div>
);

const PolicyNumberRow: React.FC<{
  label: string;
  unit: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  critical?: boolean;
  disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ label, unit, desc, value, min, max, critical, disabled, onChange }) => (
  <div className="surface-2 p-3 flex items-center gap-3">
    <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}>
      <I.Clock size={15}/>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-[13px]">{label}</div>
        {critical && <span className="chip" style={{ background: 'var(--rose-soft)', color: '#ff7585' }}>crítico</span>}
      </div>
      {desc && <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{desc}</div>}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <input
        type="number"
        min={min}
        max={max}
        className="input"
        style={{ width: 80, textAlign: 'right' }}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
      />
      <div className="text-[11px] text-[color:var(--text-3)]" style={{ width: 60 }}>{unit}</div>
    </div>
  </div>
);
