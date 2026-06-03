'use client';

import { MainNav } from '@/components/site/main-nav';
import { BettingExperience } from '@/components/apostas/betting-board';

export default function ApostasPage() {
  return (
    <main className='min-h-screen bg-[#090b11] text-[#f1f3f8]'>
      <MainNav />
      <BettingExperience />
    </main>
  );
}
