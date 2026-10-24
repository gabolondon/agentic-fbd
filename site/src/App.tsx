import { Hero } from './hero/Hero.tsx';
import { Footer } from './sections/Footer.tsx';
import { TopBar } from './sections/TopBar.tsx';

export function App() {
  return (
    <>
      <TopBar />
      <main id="top">
        <Hero />
      </main>
      <Footer />
    </>
  );
}
