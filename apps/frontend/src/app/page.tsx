import { EventsShowcase } from '@/components/home/events-showcase';
import { FeaturedEvents } from '@/components/home/featured-events';
import { HeroSection } from '@/components/home/hero-section';
import { ModesSection } from '@/components/home/modes-section';
import { MainNav } from '@/components/site/main-nav';

export default function Home() {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-6 lg:px-8'>
        <MainNav />
      </div>
      <FeaturedEvents />
      <HeroSection />
      <EventsShowcase />
      <ModesSection />
    </main>
  );
}
