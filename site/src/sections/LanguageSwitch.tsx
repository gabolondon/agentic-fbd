import { useTranslation } from 'react-i18next';
import { setLanguage, type Language } from '../i18n/index.ts';

const LANGUAGES: Language[] = ['en', 'es'];

export function LanguageSwitch({ onDark = false }: { onDark?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={onDark ? 'lang on-dark' : 'lang'} role="group" aria-label={t('nav.language')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={i18n.resolvedLanguage === lang}
          onClick={() => setLanguage(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
