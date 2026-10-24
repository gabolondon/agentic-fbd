import { useTranslation } from 'react-i18next';
import { useHeroVideo } from './useHeroVideo.ts';

export function Hero() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === 'es' ? 'es' : 'en';
  const { ref, layout, reducedMotion, segment, playing, failed, toggle, onSourceError } = useHeroVideo(lang);
  const media = `/media/hero-${layout}`;

  return (
    <section className={`hero ${layout}`} id="hero">
      <video
        key={lang}
        ref={ref}
        className="hero-video"
        poster={`${media}-poster.webp`}
        autoPlay={!reducedMotion}
        muted
        loop
        playsInline
        preload={reducedMotion ? 'none' : 'auto'}
        aria-hidden="true"
      >
        <source src={`${media}-${lang}.webm`} type="video/webm" />
        <source src={`${media}-${lang}.mp4`} type="video/mp4" onError={onSourceError} />
      </video>
      <div className="hero-shade" />
      <div className="hero-copy">
        <h1 key={`t-${segment}`} className="display hero-title">
          {t(`hero.${segment}.title`)}
        </h1>
        <p key={`s-${segment}`} className="hero-subtitle">
          {t(`hero.${segment}.subtitle`)}
        </p>
        <a className="pill ghost on-dark" href="#install">
          {t('hero.install')} <span aria-hidden="true">↓</span>
        </a>
      </div>
      {!failed && (
        <button
          type="button"
          className="pill ghost on-dark hero-toggle"
          aria-label={playing ? t('hero.pause') : t('hero.play')}
          onClick={toggle}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
      )}
    </section>
  );
}
