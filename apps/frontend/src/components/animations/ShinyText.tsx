'use client';
import React from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export function ShinyText({
  text,
  disabled = false,
  speed = 5,
  className = '',
}: ShinyTextProps) {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`inline-block bg-clip-text text-transparent bg-gradient-to-r from-white/20 via-white to-white/20 bg-[length:200%_100%] ${
        !disabled ? 'animate-shiny-text' : ''
      } ${className}`}
      style={{ '--animation-duration': animationDuration } as React.CSSProperties}
    >
      {text}
    </span>
  );
}
