'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ShieldAlert, Phone, Mail, MessageCircle } from 'lucide-react';

/**
 * 201bet — RichFooter
 * Multi-column site footer with brand block, link columns, social, and legal/responsible-gaming.
 * Desktop: 4 columns. Mobile: accordion (collapse per column).
 */

export interface RichFooterProps {
  companyName?: string;
  className?: string;
}

interface LinkItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface FooterColumn {
  id: string;
  title: string;
  links: LinkItem[];
}

const COLUMNS: FooterColumn[] = [
  {
    id: 'platform',
    title: 'Plataforma',
    links: [
      { label: 'Apostas ao vivo', href: '/apostas' },
      { label: 'Eventos', href: '/eventos' },
      { label: 'Listas Brasil', href: '/listas' },
      { label: 'Regulamento', href: '/regulamento' },
    ],
  },
  {
    id: 'support',
    title: 'Suporte',
    links: [
      { label: 'Central de ajuda (FAQ)', href: '/ajuda' },
      { label: 'Fale conosco', href: '/contato', icon: <MessageCircle className='h-3.5 w-3.5' /> },
      { label: 'suporte@201bet.com', href: 'mailto:suporte@201bet.com', icon: <Mail className='h-3.5 w-3.5' /> },
    ],
  },
  {
    id: 'legal',
    title: 'Legal',
    links: [
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Política de privacidade', href: '/privacidade' },
      { label: 'Política de cookies', href: '/cookies' },
      { label: 'Política de KYC', href: '/kyc' },
      { label: 'Política antifraude', href: '/antifraude' },
    ],
  },
  {
    id: 'responsible',
    title: 'Jogo responsável',
    links: [
      { label: 'Limites e autoexclusão', href: '/jogo-responsavel' },
      { label: 'SECAP — Ministério da Fazenda', href: 'https://www.gov.br/fazenda/pt-br/assuntos/secap' },
      { label: 'Jogadores Anônimos BR', href: 'https://jogadoresanonimos.com.br' },
      { label: 'CVV — 188 (24h)', href: 'tel:188', icon: <Phone className='h-3.5 w-3.5' /> },
    ],
  },
];

function FooterColumnView({ col, openId, setOpenId }: {
  col: FooterColumn;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const isOpen = openId === col.id;
  return (
    <div className='border-b border-white/5 sm:border-b-0'>
      <button
        type='button'
        onClick={() => setOpenId(isOpen ? null : col.id)}
        className='sm:hidden w-full flex items-center justify-between py-4 text-left'
        aria-expanded={isOpen}
        aria-controls={`footer-col-${col.id}`}
      >
        <span className='font-display text-sm font-semibold uppercase tracking-[0.14em] text-[#f1f3f8]'>
          {col.title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[#767b8a] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className='hidden sm:block font-display text-sm font-semibold uppercase tracking-[0.14em] text-[#f1f3f8] mb-4'
      >
        {col.title}
      </div>

      <ul
        id={`footer-col-${col.id}`}
        className={`
          space-y-3
          ${isOpen ? 'pb-4' : 'hidden'}
          sm:!block sm:pb-0
        `}
      >
        {col.links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className='group inline-flex items-center gap-1.5 text-[13px] text-[#b8bcc9] hover:text-[#ffb028] transition-colors'
            >
              {link.icon && <span className='text-[#767b8a] group-hover:text-[#ffb028]'>{link.icon}</span>}
              <span className='border-b border-transparent group-hover:border-[#ffb028]/40'>{link.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RichFooter({
  companyName = '201bet',
  className = '',
}: RichFooterProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const year = new Date().getFullYear();

  return (
    <footer
      className={`relative w-full bg-[#0b0e18] text-[#b8bcc9] ${className}`}
      role='contentinfo'
    >
      <div className='h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,176,40,0.5),transparent)]' />

      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 opacity-60'
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, rgba(255,176,40,0.06), transparent 70%)',
        }}
      />

      <div className='relative mx-auto max-w-7xl px-5 sm:px-8 py-12 sm:py-16'>
        <div className='flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-10 border-b border-white/5 mb-10'>
          <div>
            <Link href='/' className='inline-flex items-center mb-3 transition-opacity hover:opacity-80'>
              <Image
                src='/images/logopalpite.png'
                alt='201bet'
                width={100}
                height={68}
                className='h-14 sm:h-16 w-auto'
              />
            </Link>
            <p className='text-[14px] text-[#b8bcc9] max-w-md leading-relaxed'>
              Operação total da arrancada brasileira. Listas regionais, embates ao vivo
              e o Trono Nacional disputado a cada semana.
            </p>
          </div>

        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8'>
          {COLUMNS.map((col) => (
            <FooterColumnView key={col.id} col={col} openId={openId} setOpenId={setOpenId} />
          ))}
        </div>

        <div className='mt-12 rounded-3xl border border-white/10 bg-[#101525] p-5 sm:p-6 flex items-start gap-4'>
          <div className='hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl
                          bg-[rgba(255,176,40,0.10)] border border-[rgba(255,176,40,0.25)]'>
            <ShieldAlert className='h-5 w-5 text-[#ffb028]' />
          </div>
          <div>
            <div className='flex items-center gap-2 mb-1.5'>
              <AgeBadge />
              <span className='font-display text-sm font-semibold uppercase tracking-[0.12em] text-[#f1f3f8]'>
                Jogo responsável
              </span>
            </div>
            <p className='text-[13px] text-[#b8bcc9] max-w-2xl leading-relaxed'>
              Apostas envolvem risco. Aposte apenas o que pode perder. Se você ou alguém
              próximo apresentar sinais de ludopatia, ligue <span className='text-[#f1f3f8] font-mono'>188</span> (CVV, 24h).
            </p>
          </div>
        </div>

        <div className='mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[12px] text-[#767b8a]'>
          <div>
            © {year} {companyName}. Todos os direitos reservados.
          </div>
          <div className='font-mono'>
            Operado por {companyName} Brasil LTDA
          </div>
        </div>
      </div>
    </footer>
  );
}

function AgeBadge() {
  return (
    <span
      className='inline-flex items-center justify-center
                 h-6 min-w-[2.4rem] px-1.5 rounded-md
                 bg-[#ff5a6c] text-white font-display font-bold text-[11px]
                 ring-2 ring-[#ff5a6c]/30 shadow-[0_0_0_1px_rgba(0,0,0,0.3)]'
      title='Conteúdo destinado a maiores de 18 anos'
    >
      +18
    </span>
  );
}

export default RichFooter;
