import * as React from 'react';

type IconProps = Omit<React.SVGProps<SVGSVGElement>, 'stroke'> & { size?: number; stroke?: number };

const Base: React.FC<IconProps & { children: React.ReactNode }> = ({ children, size = 18, stroke = 1.6, ...rest }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

export const I = {
  Dashboard: (p: IconProps) => <Base {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Base>,
  Trophy: (p: IconProps) => <Base {...p}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v3a3 3 0 0 1-3 3M7 5H4v3a3 3 0 0 0 3 3"/></Base>,
  Users: (p: IconProps) => <Base {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Base>,
  Receipt: (p: IconProps) => <Base {...p}><path d="M4 2h16v20l-3-2-3 2-3-2-3 2-4-2V2Z"/><path d="M8 7h8M8 11h8M8 15h5"/></Base>,
  Chart: (p: IconProps) => <Base {...p}><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-7"/></Base>,
  Settings: (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Base>,
  Flame: (p: IconProps) => <Base {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c2.5 0 3-2 3-3 .5 1 1 2 1 3a4 4 0 1 1-8 0c0-1.5 1.2-3 2-4 .8-.8 1.5-2 1.5-4 1 1 5 4 5 8a5 5 0 1 1-10 0c0-2 1-3 2-4Z"/></Base>,
  ChevronLeft: (p: IconProps) => <Base {...p}><path d="M15 18l-6-6 6-6"/></Base>,
  ChevronRight: (p: IconProps) => <Base {...p}><path d="M9 18l6-6-6-6"/></Base>,
  ChevronDown: (p: IconProps) => <Base {...p}><path d="M6 9l6 6 6-6"/></Base>,
  Plus: (p: IconProps) => <Base {...p}><path d="M12 5v14M5 12h14"/></Base>,
  Search: (p: IconProps) => <Base {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Base>,
  Bell: (p: IconProps) => <Base {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></Base>,
  Filter: (p: IconProps) => <Base {...p}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></Base>,
  Download: (p: IconProps) => <Base {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Base>,
  Upload: (p: IconProps) => <Base {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></Base>,
  Edit: (p: IconProps) => <Base {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></Base>,
  Trash: (p: IconProps) => <Base {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></Base>,
  Play: (p: IconProps) => <Base {...p}><path d="M6 4l14 8-14 8V4Z"/></Base>,
  Pause: (p: IconProps) => <Base {...p}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></Base>,
  Check: (p: IconProps) => <Base {...p}><path d="M20 6L9 17l-5-5"/></Base>,
  X: (p: IconProps) => <Base {...p}><path d="M18 6L6 18M6 6l12 12"/></Base>,
  Dollar: (p: IconProps) => <Base {...p}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></Base>,
  Activity: (p: IconProps) => <Base {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Base>,
  TrendUp: (p: IconProps) => <Base {...p}><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></Base>,
  TrendDown: (p: IconProps) => <Base {...p}><path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></Base>,
  Calendar: (p: IconProps) => <Base {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Base>,
  Clock: (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Base>,
  Bolt: (p: IconProps) => <Base {...p}><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8Z"/></Base>,
  Eye: (p: IconProps) => <Base {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></Base>,
  Logout: (p: IconProps) => <Base {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Base>,
  Menu: (p: IconProps) => <Base {...p}><path d="M3 6h18M3 12h18M3 18h18"/></Base>,
  More: (p: IconProps) => <Base {...p}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></Base>,
  Sparkles: (p: IconProps) => <Base {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/></Base>,
  Wallet: (p: IconProps) => <Base {...p}><path d="M20 12V7a2 2 0 0 0-2-2H4a2 2 0 0 0 0 4h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8"/><circle cx="17" cy="14" r="1.4" fill="currentColor"/></Base>,
  Globe: (p: IconProps) => <Base {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a14 14 0 0 1 0 20M12 2a14 14 0 0 0 0 20"/></Base>,
  Shield: (p: IconProps) => <Base {...p}><path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3Z"/></Base>,
  Layers: (p: IconProps) => <Base {...p}><path d="M12 2l10 6-10 6L2 8l10-6Z"/><path d="M2 16l10 6 10-6M2 12l10 6 10-6"/></Base>,
  AlertTriangle: (p: IconProps) => <Base {...p}><path d="M12 3l10 18H2L12 3Z"/><path d="M12 9v5M12 18v.01"/></Base>,
  ArrowRight: (p: IconProps) => <Base {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Base>,
  Save: (p: IconProps) => <Base {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></Base>,
  User: (p: IconProps) => <Base {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Base>,
  Lock: (p: IconProps) => <Base {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Base>,
  EyeOff: (p: IconProps) => <Base {...p}><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.4 4.3M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.5-1.1"/></Base>,
  Login: (p: IconProps) => <Base {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></Base>,
  RotateCcw: (p: IconProps) => <Base {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></Base>,
};

export type IconName = keyof typeof I;
