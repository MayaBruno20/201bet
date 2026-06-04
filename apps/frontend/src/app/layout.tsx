import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Palpite201',
  description: 'A arrancada brasileira em apostas: Listas Brasil, embates ao vivo e o Trono Nacional disputado a cada semana.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='pt-BR'>
      <body className='min-h-screen'>{children}</body>
    </html>
  );
}
