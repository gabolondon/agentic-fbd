export type Language = 'en' | 'es';

const KEY = 'afbd.lang';

/** The stored choice wins; otherwise the first browser language that is English or Spanish. */
export function pickLanguage(stored: string | null, browser: readonly string[]): Language {
  if (stored === 'en' || stored === 'es') return stored;
  for (const tag of browser) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'en' || primary === 'es') return primary;
  }
  return 'en';
}

// Storage can throw (private windows, blocked site data); the page works without it.
export function storedLanguage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeLanguage(lang: Language): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not remembered; the switch still works for this visit.
  }
}
