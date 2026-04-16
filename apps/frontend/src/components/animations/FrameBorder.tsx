'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface FrameBorderProps {
  children: React.ReactNode;
  duration?: number;
  borderWidth?: number;
  className?: string;
  borderColor?: string;
  padding?: string;
}

export function FrameBorder({
  children,
  duration = 3,
  borderWidth = 1,
  className = '',
  borderColor = 'rgba(59, 130, 246, 0.5)',
  padding = 'p-6',
}: FrameBorderProps) {
  return (
    <div className={`relative group ${className}`}>
      {/* Animated Top Border */}
      <motion.div
        className="absolute top-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent z-20"
        initial={{ width: '0%', left: '0%' }}
        animate={{ 
          width: ['0%', '100%', '0%'],
          left: ['0%', '0%', '100%']
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      
      {/* Animated Right Border */}
      <motion.div
        className="absolute top-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-white/50 to-transparent z-20"
        initial={{ height: '0%', top: '0%' }}
        animate={{ 
          height: ['0%', '100%', '0%'],
          top: ['0%', '0%', '100%']
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
          delay: duration / 4,
        }}
      />

      {/* Animated Bottom Border */}
      <motion.div
        className="absolute bottom-0 right-0 h-[1px] bg-gradient-to-l from-transparent via-white/50 to-transparent z-20"
        initial={{ width: '0%', right: '0%' }}
        animate={{ 
          width: ['0%', '100%', '0%'],
          right: ['0%', '0%', '100%']
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
          delay: duration / 2,
        }}
      />

      {/* Animated Left Border */}
      <motion.div
        className="absolute bottom-0 left-0 w-[1px] bg-gradient-to-t from-transparent via-white/50 to-transparent z-20"
        initial={{ height: '0%', bottom: '0%' }}
        animate={{ 
          height: ['0%', '100%', '0%'],
          bottom: ['0%', '0%', '100%']
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
          delay: (duration * 3) / 4,
        }}
      />

      {/* Static Border Base */}
      <div className="absolute inset-0 border border-white/5 rounded-3xl" />
      
      <div className={`relative z-10 ${padding}`}>
        {children}
      </div>
    </div>
  );
}
