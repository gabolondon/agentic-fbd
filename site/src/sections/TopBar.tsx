import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from './LanguageSwitch.tsx';

export const GITHUB_URL = 'https://github.com/gabolondon/agentic-fbd';

export function TopBar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-side">
        <button
          type="button"
          className="pill ghost on-dark"
          aria-expanded={open}
          aria-controls="menu"
          onClick={() => setOpen(!open)}
        >
          {open ? t('nav.close') : t('nav.menu')}
        </button>
        {open && (
          <nav id="menu" className="menu" onClick={() => setOpen(false)}>
            <a href="#features">{t('nav.features')}</a>
            <a href="#example">{t('nav.example')}</a>
            <a href="#install">{t('nav.install')}</a>
            <a href={GITHUB_URL} rel="noopener">
              {t('nav.github')} <span aria-hidden="true">↗</span>
            </a>
          </nav>
        )}
      </div>
      <a className="wordmark" href="#top" aria-label={t('nav.home')}>
        agentic-fbd
      </a>
      <div className="topbar-side end">
        <LanguageSwitch onDark />
        <a className="pill ghost on-dark github" href={GITHUB_URL} rel="noopener">
          {t('nav.github')} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}
