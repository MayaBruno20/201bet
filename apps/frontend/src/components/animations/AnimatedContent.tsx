'use client';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedContentProps {
  children: ReactNode;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  config?: { tension: number; friction: number };
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  threshold?: number;
  delay?: number;
  duration?: number;
  className?: string;
}

export function AnimatedContent({
  children,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  config = { tension: 120, friction: 14 },
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  duration = 0.5,
  className,
}: AnimatedContentProps) {
  const directionOffset = reverse ? -distance : distance;
  
  const x = direction === 'horizontal' ? directionOffset : 0;
  const y = direction === 'vertical' ? directionOffset : 0;

  return (
    <motion.div
      className={className}
      initial={{
        opacity: initialOpacity,
        x,
        y,
        scale
      }}
      whileInView={{ 
        opacity: 1, 
        x: 0, 
        y: 0, 
        scale: 1 
      }}
      viewport={{ once: true, amount: threshold }}
      transition={{
        delay,
        duration,
        ease: [0.21, 0.47, 0.32, 0.98], // Custom spring-like cubic bezier
      }}
    >
      {children}
    </motion.div>
  );
}
