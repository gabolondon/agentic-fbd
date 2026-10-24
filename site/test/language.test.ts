import { expect, test } from 'vitest';
import { pickLanguage } from '../src/i18n/language.ts';

test.each([
  ['es', ['en-US'], 'es'],
  ['en', ['es-CO'], 'en'],
  [null, ['es-CO', 'en'], 'es'],
  [null, ['fr-FR', 'es'], 'es'],
  [null, ['en-GB', 'es'], 'en'],
  [null, [], 'en'],
  ['de', ['de-DE'], 'en'],
] as const)('pickLanguage(%s, %j) is %s', (stored, browser, want) => {
  expect(pickLanguage(stored, browser)).toBe(want);
});
