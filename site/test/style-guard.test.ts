import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { blurredShadows, colorLiterals, rawShapes } from '../../tests/helpers/css.ts';

const src = resolve(import.meta.dirname, '../src');
const files = (readdirSync(src, { recursive: true }) as string[]).map((f) => join(src, f));
const styles = files.filter((f) => f.endsWith('.css'));
const code = files.filter((f) => /\.(css|tsx?)$/.test(f));

// Colors, radii and the UI font come from packages/theme/tokens.css; the display font is
// the one --font-display declaration in styles.css.
test('site styles and code hold no color literals', () => {
  for (const file of code) expect(colorLiterals(file), file).toEqual([]);
});

test('no blurred shadows', () => {
  for (const file of styles) expect(blurredShadows(file), file).toEqual([]);
});

test('shapes and fonts come from tokens', () => {
  for (const file of styles) expect(rawShapes(file), file).toEqual([]);
});
