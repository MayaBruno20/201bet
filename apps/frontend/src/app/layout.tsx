import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import { SiteFooter } from '@/components/site/site-footer';
import { ConfirmProvider } from '@/components/confirm-dialog';
import './globals.css';

const fontSans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const fontMono = Roboto_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '201Bet | Front MVP',
  description: 'MVP de apostas em tempo real com Next.js + WebSocket',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='pt-BR'>
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}>
        <ConfirmProvider>
          {children}
          <SiteFooter />
        </ConfirmProvider>
      </body>
    </html>
  );
}
