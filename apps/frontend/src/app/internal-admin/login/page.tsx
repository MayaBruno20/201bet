'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { I } from '@admin/components/ui/icons';
import { login as apiLogin, loginVerify2FA } from '@admin/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [pwd, setPwd] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [step, setStep] = React.useState<'creds' | '2fa'>('creds');
  const [code, setCode] = React.useState(['', '', '', '', '', '']);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [tempToken, setTempToken] = React.useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = React.useState(false);
  const [backupCode, setBackupCode] = React.useState('');
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pwd || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiLogin(email, pwd);
      if (result.kind === '2fa-required') {
        setTempToken(result.tempToken);
        setStep('2fa');
        setTimeout(() => refs.current[0]?.focus(), 100);
      } else {
        // Login direto (sem 2FA habilitado)
        router.replace('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar');
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...code]; next[i] = d; setCode(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const verify = async () => {
    if (!tempToken) return;
    const submittedCode = useBackupCode ? backupCode.trim() : code.join('');
    if (useBackupCode ? !submittedCode : code.some((c) => !c)) return;
    setLoading(true);
    setError('');
    try {
      await loginVerify2FA(tempToken, submittedCode);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 30% 20%, rgba(255,176,40,0.18), transparent 55%), radial-gradient(circle at 70% 80%, rgba(255,90,108,0.12), transparent 50%), var(--bg-2)',
          borderRight: '1px solid var(--border)',
        }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: 'linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}/>
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-4 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logopalpite.png" alt="Palpite201" className="h-20 w-auto"/>
            <div>
              <div className="text-[11px] tracking-[0.16em] uppercase text-[color:var(--text-3)] font-semibold">Admin Console</div>
            </div>
          </div>
          <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-tight">
            Operação total da<br/>arrancada brasileira.
          </h1>
          <p className="text-[14px] text-[color:var(--text-2)] mt-4 leading-relaxed">
            Eventos ao vivo, listas por DDD, Armageddon — tudo num só console.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logopalpite.png" alt="Palpite201" className="h-14 w-auto"/>
          </div>

          {step === 'creds' && (
            <>
              <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[color:var(--text-3)]">Acesso restrito</div>
              <h2 className="font-display text-[28px] font-bold mt-1">Entre na sua conta</h2>
              <p className="text-[13px] text-[color:var(--text-3)] mt-1">Use suas credenciais administrativas.</p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Email</label>
                  <div className="relative mt-1">
                    <I.User size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }}/>
                    <input className="input pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"/>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Senha</label>
                    <button type="button" className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Esqueci</button>
                  </div>
                  <div className="relative mt-1">
                    <I.Lock size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }}/>
                    <input className="input pl-9 pr-10" type={show ? 'text' : 'password'} value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" required autoComplete="current-password"/>
                    <button type="button" onClick={() => setShow(!show)} className="btn-icon" style={{ position: 'absolute', right: 4, top: 4 }}>
                      {show ? <I.EyeOff size={14}/> : <I.Eye size={14}/>}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-[color:var(--text-2)] cursor-pointer select-none">
                  <input type="checkbox" defaultChecked/> Manter conectado neste dispositivo
                </label>
                <button type="submit" className="btn btn-primary w-full justify-center py-2.5" disabled={loading}>
                  {loading ? <><span className="pulse-dot"/> Validando…</> : <><I.Login size={15}/> Entrar</>}
                </button>
                {error && (
                  <div className="rounded-[10px] px-3 py-2 text-[12px]" style={{ background: 'var(--rose-soft)', color: 'var(--rose)', border: '1px solid var(--rose-soft)' }}>
                    {error}
                  </div>
                )}
              </form>

              <div className="mt-6 surface-2 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-[8px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <I.Shield size={14}/>
                </div>
                <div className="text-[12px] text-[color:var(--text-2)] leading-relaxed">
                  Acesso protegido por <strong>2FA</strong>. Tentativas suspeitas são auditadas e podem bloquear sua conta.
                </div>
              </div>
            </>
          )}

          {step === '2fa' && (
            <>
              <button onClick={() => { setStep('creds'); setTempToken(null); setError(''); setCode(['', '', '', '', '', '']); setUseBackupCode(false); setBackupCode(''); }} className="text-[12px] text-[color:var(--text-3)] hover:underline flex items-center gap-1 mb-4">
                <I.ChevronLeft size={13}/> Voltar
              </button>
              <div className="w-12 h-12 rounded-[14px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Shield size={20}/>
              </div>
              <h2 className="font-display text-[26px] font-bold mt-4">Verificação em 2 etapas</h2>
              <p className="text-[13px] text-[color:var(--text-3)] mt-1">
                {useBackupCode
                  ? 'Cole um dos backup codes que você gerou ao ativar 2FA.'
                  : 'Digite o código de 6 dígitos do seu app autenticador.'}
              </p>

              {!useBackupCode ? (
                <div className="flex items-center gap-2 mt-7">
                  {code.map((c, i) => (
                    <input key={i} ref={(el) => { refs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={c}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus(); }}
                      className="font-display text-[22px] font-bold text-center"
                      style={{ width: 48, height: 56, borderRadius: 12, background: 'var(--surface)', border: '1px solid ' + (c ? 'var(--accent-ring)' : 'var(--border-strong)'), color: 'var(--text)' }}/>
                  ))}
                </div>
              ) : (
                <input
                  className="input mt-7 font-mono uppercase tracking-widest text-center"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF1234"
                  maxLength={10}
                  autoFocus
                />
              )}

              <button onClick={verify} className="btn btn-primary w-full justify-center py-2.5 mt-6"
                disabled={loading || (useBackupCode ? !backupCode.trim() : code.some((c) => !c))}>
                {loading ? <><span className="pulse-dot"/> Verificando…</> : <><I.Check size={15}/> Verificar e entrar</>}
              </button>

              {error && (
                <div className="mt-3 rounded-[10px] px-3 py-2 text-[12px]" style={{ background: 'var(--rose-soft)', color: 'var(--rose)', border: '1px solid var(--rose-soft)' }}>
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end mt-4 text-[12px]">
                <button
                  type="button"
                  onClick={() => { setUseBackupCode((v) => !v); setError(''); }}
                  className="hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  {useBackupCode ? 'Voltar ao código TOTP' : 'Usar código de backup'}
                </button>
              </div>
            </>
          )}

          <div className="mt-10 pt-6 flex items-center justify-between text-[11px] text-[color:var(--text-4)]" style={{ borderTop: '1px solid var(--border)' }}>
            <span>Acesso restrito a operadores autorizados.</span>
            <span>v2.4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
