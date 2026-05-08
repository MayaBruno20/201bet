import { Inter, Roboto_Mono } from 'next/font/google';
import { SiteFooter } from '@/components/site/site-footer';
import { WhatsAppButton } from '@/components/site/whatsapp-button';
import { ConfirmProvider } from '@/components/confirm-dialog';

const fontSans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

const fontMono = Roboto_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fontSans.variable} ${fontMono.variable} min-h-full antialiased`}>
      <ConfirmProvider>
        {children}
        <SiteFooter />
        <WhatsAppButton />
      </ConfirmProvider>
    </div>
  );
}
