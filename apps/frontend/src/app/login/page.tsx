'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BirthdateInput } from '@/components/forms/birthdate-input';
import { isAdult } from '@/lib/birthdate';
import { MainNav } from '@/components/site/main-nav';
import { getPostAuthPath, setStoredAccessToken, setStoredUser, type SessionUser } from '@/lib/auth';
import { apiFetch, parseApiErrorMessage } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';
import { maskCPF, unmaskCPF } from '@/lib/masks';

const apiUrl = getPublicApiUrl();
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type AuthMode = 'login' | 'register';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [name, setName] = useState('');
  const [googleReady, setGoogleReady] = useState(false);

  function clearSensitiveFields() {
    setPassword('');
    setConfirmPassword('');
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    clearSensitiveFields();
  }

  async function authenticate(endpoint: 'login' | 'register', payload: Record<string, unknown>) {
    const response = await apiFetch(`${apiUrl}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(parseApiErrorMessage(text, 'Falha na autenticação.'));
    }

    const data = (await response.json()) as { user: SessionUser; accessToken?: string };
    setStoredUser(data.user);
    if (data.accessToken) {
      setStoredAccessToken(data.accessToken);
    }
    router.push(getPostAuthPath(data.user));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await authenticate('login', { email, password });
      } else {
        const cpfDigits = cpf.replace(/\D/g, '');
        const regErr = validateRegisterClient(name, password, confirmPassword, cpfDigits, birthDate);
        if (regErr) {
          throw new Error(regErr);
        }

        await authenticate('register', {
          email: email.trim(),
          password,
          confirmPassword,
          name: name.trim(),
          cpf: cpfDigits,
          birthDate,
        });
      }
    } catch (err) {
      if (mode === 'register') {
        clearSensitiveFields();
      }
      setError(err instanceof Error ? err.message : 'Erro inesperado na autenticação.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!googleClientId || !googleReady || !window.google) {
      return;
    }

    const googleButtonElement = document.getElementById('google-signin-button');
    if (!googleButtonElement) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async ({ credential }) => {
        try {
          setLoading(true);
          setError(null);

          const response = await apiFetch(`${apiUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: credential }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(parseApiErrorMessage(text, 'Falha no login Google'));
          }

          const data = (await response.json()) as { user: SessionUser; accessToken?: string };
          setStoredUser(data.user);
          if (data.accessToken) setStoredAccessToken(data.accessToken);
          router.push(getPostAuthPath(data.user));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro no login Google.');
        } finally {
          setLoading(false);
        }
      },
    });

    googleButtonElement.innerHTML = '';
    window.google.accounts.id.renderButton(googleButtonElement, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: '360',
    });
  }, [googleReady, router, mode]);

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      {googleClientId ? (
        <Script src='https://accounts.google.com/gsi/client' strategy='afterInteractive' onLoad={() => setGoogleReady(true)} />
      ) : null}

      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Entrar na plataforma</h1>
          <p className='mt-2 text-sm text-white/50'>Acesse para ver seus tickets, saldo e histórico.</p>

          <div className='mt-5 flex gap-2'>
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300 ${mode === 'login' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              onClick={() => switchMode('login')}
              type='button'
            >
              Login
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300 ${mode === 'register' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              onClick={() => switchMode('register')}
              type='button'
            >
              Cadastro
            </button>
          </div>

          <form className='mt-5 space-y-4' onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <input
                className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                type='text'
                placeholder='Nome'
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                required
              />
            ) : null}

            <input
              className='w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm'
              type='email'
              placeholder='E-mail'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className='w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm'
              type='password'
              placeholder='Senha'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {mode === 'register' ? (
              <>
                <input
                  className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                  type='password'
                  placeholder='Confirmar senha'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <input
                  className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                  type='text'
                  inputMode='numeric'
                  placeholder='CPF'
                  value={maskCPF(cpf)}
                  onChange={(e) => setCpf(unmaskCPF(e.target.value).slice(0, 11))}
                  required
                />
                <BirthdateInput value={birthDate} onChange={setBirthDate} id='register-birth' />
              </>
            ) : null}
            <button disabled={loading} className='w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.01] disabled:opacity-50 disabled:pointer-events-none'>
              {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
            {mode === 'login' ? (
              <div className='text-right'>
                <Link href='/forgot-password' className='text-xs text-white/60 hover:text-white transition-colors'>
                  Esqueci minha senha
                </Link>
              </div>
            ) : null}
          </form>

          {mode === 'register' && googleClientId ? (
            <p className='mt-4 text-center text-xs text-white/50'>
              Ou crie a conta com Google; depois informe CPF e data de nascimento.
            </p>
          ) : null}

          {googleClientId ? (
            <>
              <div className='mt-4 flex items-center gap-3'>
                <span className='h-px flex-1 bg-white/15' />
                <span className='text-xs text-white/60'>ou</span>
                <span className='h-px flex-1 bg-white/15' />
              </div>
              <div id='google-signin-button' className='mt-4 flex justify-center' />
            </>
          ) : null}

          {error ? <p className='mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200'>{error}</p> : null}

          <p className='mt-5 text-sm text-white/40'>
            Precisa de suporte?{' '}
            <Link href='/' className='text-white/70 hover:text-white transition-colors'>
              Atendimento por e-mail e WhatsApp
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

/** Espelha regras de `RegisterDto` / `AuthService.register` para erro amigável antes do POST. */
function validateRegisterClient(
  name: string,
  password: string,
  confirmPassword: string,
  cpfDigits: string,
  birthDate: string,
): string | null {
  if (name.trim().length < 2) {
    return 'Informe o nome com pelo menos 2 caracteres.';
  }
  if (password.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.';
  }
  if (password !== confirmPassword) {
    return 'Senha e confirmação não conferem.';
  }
  if (cpfDigits.length !== 11) {
    return 'CPF deve conter exatamente 11 dígitos.';
  }
  if (!isAdult(birthDate)) {
    return 'Cadastro permitido apenas para maiores de 18 anos.';
  }
  return null;
}
