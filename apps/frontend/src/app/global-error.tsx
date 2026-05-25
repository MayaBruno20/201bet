'use client';

import { useEffect } from 'react';

/**
 * Fallback global do App Router. Só é renderizado quando o RootLayout em si
 * quebra (ou um error.tsx de segmento explode). Precisa renderizar <html>/<body>
 * porque substitui o layout raiz.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[201bet] global error:', error);
  }, [error]);

  return (
    <html lang='pt-BR'>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#090b11',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(16,21,37,0.95)',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Falha crítica
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            Tivemos um erro inesperado. Tente recarregar a página.
          </p>
          {error.digest && (
            <p style={{ marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'ui-monospace, monospace' }}>
              ref: {error.digest}
            </p>
          )}
          <button
            type='button'
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: '10px 20px',
              borderRadius: 12,
              background: '#fff',
              color: '#000',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
