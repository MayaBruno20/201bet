import { EventsShowcase } from '@/components/home/events-showcase';
import { HeroSection } from '@/components/home/hero-section';
import { ModesSection } from '@/components/home/modes-section';
import { MainNav } from '@/components/site/main-nav';
import { upcomingEvents } from '@/lib/events';

export default function Home() {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8'>
        <MainNav />
      </div>
      <HeroSection />
      <EventsShowcase events={upcomingEvents} />
      <ModesSection />
    </main>
  );
}
