import Image from 'next/image';
import Link from 'next/link';

type FooterLink = { href: string; label: string };

const navLinks: FooterLink[] = [
  { href: '/', label: 'Início' },
  { href: '/apostas', label: 'Apostas' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/listas', label: 'Listas Brasil' },
];

const infoLinks: FooterLink[] = [
  { href: '/regulamento', label: 'Regulamento' },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className='mt-16 border-t border-white/5 bg-[#070910]'>
      <div className='mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8'>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-4'>
          <div className='md:col-span-2'>
            <Link href='/' className='inline-flex items-center transition-opacity hover:opacity-80'>
              <Image src='/images/logo.png' alt='201bet' width={140} height={36} className='h-8 w-auto' />
            </Link>
            <p className='mt-4 max-w-md text-sm text-white/50'>
              Apostas esportivas em tempo real focadas na cultura brasileira de arrancada. Mercados homologados,
              liquidação automática e transparência em cada embate.
            </p>
          </div>

          <div>
            <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>Navegação</p>
            <ul className='mt-3 space-y-2'>
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className='text-sm text-white/70 transition hover:text-white'>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>Informações</p>
            <ul className='mt-3 space-y-2'>
              {infoLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className='text-sm text-white/70 transition hover:text-white'>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className='mt-10 flex flex-col gap-3 border-t border-white/5 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between'>
          <p>© {year} 201bet. Todos os direitos reservados.</p>
          <p className='sm:text-right'>Jogue com responsabilidade. Proibido para menores de 18 anos.</p>
        </div>
      </div>
    </footer>
  );
}
