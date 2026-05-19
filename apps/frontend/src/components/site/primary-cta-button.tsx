'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * 201bet — PrimaryCTAButton
 * Primary "Apostar agora" call-to-action. Used in nav, hero, sticky bars.
 */

export type PrimaryCTAButtonVariant = 'primary' | 'ghost' | 'compact';

type CommonProps = {
  children: React.ReactNode;
  variant?: PrimaryCTAButtonVariant;
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
  'aria-label'?: string;
};

type ButtonProps = CommonProps & {
  asLink?: false;
} & Omit<HTMLMotionProps<'button'>, keyof CommonProps | 'children'>;

type LinkProps = CommonProps & {
  asLink: true;
  href: string;
} & Omit<HTMLMotionProps<'a'>, keyof CommonProps | 'children' | 'href'>;

export type PrimaryCTAButtonProps = ButtonProps | LinkProps;

const baseClasses =
  'group relative inline-flex items-center justify-center gap-2 font-display font-semibold ' +
  'tracking-tight whitespace-nowrap select-none outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-[#090b11] disabled:cursor-not-allowed disabled:opacity-50 ' +
  'transition-[transform,box-shadow,filter] duration-200 ease-out';

const variantClasses: Record<PrimaryCTAButtonVariant, string> = {
  primary:
    'h-12 px-6 text-[15px] rounded-2xl text-[#1a1305] ' +
    'bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] ' +
    'shadow-[0_10px_30px_-10px_rgba(255,138,42,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] ' +
    'hover:shadow-[0_18px_40px_-12px_rgba(255,138,42,0.8),inset_0_1px_0_rgba(255,255,255,0.55)] ' +
    'hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:brightness-95',
  ghost:
    'h-12 px-6 text-[15px] rounded-2xl text-white ' +
    'bg-white/[0.03] border border-white/10 backdrop-blur-sm ' +
    'hover:bg-white/[0.07] hover:border-white/20 hover:-translate-y-0.5',
  compact:
    'h-9 px-4 text-sm rounded-xl text-[#1a1305] ' +
    'bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] ' +
    'shadow-[0_6px_18px_-8px_rgba(255,138,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] ' +
    'hover:brightness-[1.05] hover:-translate-y-px active:translate-y-0',
};

export function PrimaryCTAButton(props: PrimaryCTAButtonProps) {
  const {
    children,
    variant = 'primary',
    icon,
    loading = false,
    className = '',
    ...rest
  } = props;

  const cls = `${baseClasses} ${variantClasses[variant]} ${className}`;

  const content = (
    <>
      {(variant === 'primary' || variant === 'compact') && (
        <span
          aria-hidden
          className='pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]'
        >
          <span
            className='absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md
                       opacity-0 group-hover:opacity-100
                       group-hover:translate-x-[420%] transition-all duration-[900ms] ease-out'
          />
        </span>
      )}
      <span className='relative inline-flex items-center gap-2'>
        {loading ? (
          <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
        ) : icon ? (
          <span className='inline-flex h-4 w-4 items-center justify-center' aria-hidden>
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
      </span>
    </>
  );

  if ('asLink' in props && props.asLink) {
    const { asLink: _asLink, href, ...anchorRest } = rest as LinkProps;
    return (
      <motion.a
        href={href}
        whileTap={{ scale: 0.98 }}
        className={cls}
        aria-busy={loading || undefined}
        {...anchorRest}
      >
        {content}
      </motion.a>
    );
  }

  const buttonRest = rest as ButtonProps;
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={cls}
      disabled={loading || buttonRest.disabled}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {content}
    </motion.button>
  );
}

export default PrimaryCTAButton;
