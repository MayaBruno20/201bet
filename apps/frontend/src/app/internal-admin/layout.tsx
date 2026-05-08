import type { Metadata } from 'next';
import './admin-shell.css';

export const metadata: Metadata = {
  title: '201bet · Admin',
  description: 'Painel administrativo 201bet',
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel='preconnect' href='https://fonts.googleapis.com' />
      <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
      <link
        href='https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Sora:wght@500;600;700;800&display=swap'
        rel='stylesheet'
      />
      <div className='admin-shell'>{children}</div>
    </>
  );
}
