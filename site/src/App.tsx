import { Hero } from './hero/Hero.tsx';
import { Example } from './sections/Example.tsx';
import { Features } from './sections/Features.tsx';
import { Footer } from './sections/Footer.tsx';
import { Install } from './sections/Install.tsx';
import { Statement } from './sections/Statement.tsx';
import { TopBar } from './sections/TopBar.tsx';
import { TryIt } from './sections/TryIt.tsx';

export function App() {
  return (
    <>
      <TopBar />
      <main id="top">
        <Hero />
        <Statement />
        <Features />
        <Example />
        <TryIt />
        <Install />
      </main>
      <Footer />
    </>
  );
}
