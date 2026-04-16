'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { setAuthToken, setStoredUser, type SessionUser } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';

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

  const [email, setEmail] = useState('admin@201bet.local');
  const [password, setPassword] = useState('Admin@201Bet123');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [name, setName] = useState('');
  const [googleReady, setGoogleReady] = useState(false);

  async function authenticate(endpoint: 'login' | 'register', payload: Record<string, unknown>) {
    const response = await fetch(`${apiUrl}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Falha na autenticação.');
    }

    const data = (await response.json()) as { accessToken: string; user: SessionUser };
    setAuthToken(data.accessToken);
    setStoredUser(data.user);
    router.push(data.user.role === 'USER' ? '/carteira' : '/admin');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        await authenticate('login', { email, password });
      } else {
        if (password !== confirmPassword) {
          throw new Error('Senha e confirmação não conferem.');
        }

        if (!isAdult(birthDate)) {
          throw new Error('Cadastro permitido apenas para maiores de 18 anos.');
        }

        await authenticate('register', { email, password, confirmPassword, name, cpf: cpf.replace(/\D/g, ''), birthDate });
      }
    } catch (err) {
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

          const response = await fetch(`${apiUrl}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: credential }),
          });

          if (!response.ok) {
            const message = await response.text();
            throw new Error(message || 'Falha no login Google');
          }

          const data = (await response.json()) as { accessToken: string; user: SessionUser };
          setAuthToken(data.accessToken);
          setStoredUser(data.user);
          router.push(data.user.role === 'USER' ? '/carteira' : '/admin');
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
  }, [googleReady, router]);

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <Script src='https://accounts.google.com/gsi/client' strategy='afterInteractive' onLoad={() => setGoogleReady(true)} />

      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />
        <section className='mx-auto mt-12 max-w-md rounded-3xl border border-white/10 bg-[#101525] p-8 backdrop-blur-md'>
          <h1 className='text-2xl font-semibold tracking-tight'>Entrar na plataforma</h1>
          <p className='mt-2 text-sm text-white/50'>Acesse para ver seus tickets, saldo e histórico.</p>

          <div className='mt-5 flex gap-2'>
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300 ${mode === 'login' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              onClick={() => setMode('login')}
              type='button'
            >
              Login
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-300 ${mode === 'register' ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              onClick={() => setMode('register')}
              type='button'
            >
              Cadastro
            </button>
          </div>

          <form className='mt-5 space-y-3' onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <input
                className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                type='text'
                placeholder='Nome'
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                  required
                />
                <input
                  className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                  type='text'
                  inputMode='numeric'
                  placeholder='CPF (somente números)'
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  required
                />
                <input
                  className='w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
                  type='date'
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
              </>
            ) : null}
            <button disabled={loading} className='w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.01] disabled:opacity-50 disabled:pointer-events-none'>
              {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          </form>

          <div className='mt-4 flex items-center gap-3'>
            <span className='h-px flex-1 bg-white/15' />
            <span className='text-xs text-white/60'>ou</span>
            <span className='h-px flex-1 bg-white/15' />
          </div>

          <div id='google-signin-button' className='mt-4 flex justify-center' />
          {!googleClientId ? (
            <p className='mt-2 text-center text-xs text-amber-200'>Configure `NEXT_PUBLIC_GOOGLE_CLIENT_ID` para habilitar Google Login.</p>
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

function isAdult(isoDate: string) {
  if (!isoDate) return false;

  const dob = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 18;
}
