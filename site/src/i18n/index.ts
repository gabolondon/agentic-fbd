import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import { pickLanguage, storedLanguage, storeLanguage, type Language } from './language.ts';

const initial = pickLanguage(storedLanguage(), navigator.languages ?? [navigator.language]);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
document.documentElement.lang = initial;

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  storeLanguage(lang);
}

export type { Language };
export default i18n;
