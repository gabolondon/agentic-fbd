import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { blurredShadows, colorLiterals, rawShapes, read, stripComments } from '../../../tests/helpers/css.ts';

const tokensCss = resolve(import.meta.dirname, '../../theme/tokens.css');
const viewerSrc = resolve(import.meta.dirname, '../src');
const stylesCss = join(viewerSrc, 'styles.css');
const viewerCodeFiles = (readdirSync(viewerSrc, { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => join(viewerSrc, f));

function parseTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

// WCAG 2.x contrast ratio between two #rrggbb colors.
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const tokens = parseTokens(read(tokensCss));

test('brand tokens carry the spec values', () => {
  expect(tokens['--cream']).toBe('#f7f4e8');
  expect(tokens['--ink']).toBe('#000000');
  expect(tokens['--stone']).toBe('#c6c3ba');
  expect(tokens['--violet']).toBe('#643aed');
  expect(tokens['--radius-block']).toBe('4px');
  expect(tokens['--radius-panel']).toBe('20px');
  expect(tokens['--font-ui']).toMatch(/^'Inter Variable', Inter,/);
});

// Colors used as text need 4.5:1 (risk shows up in error messages); accents used for
// wires, borders and marks need 3:1 (WCAG 1.4.11).
test.each(['--ink', '--muted', '--risk'])('%s text is readable on cream', (name) => {
  expect(contrast(tokens[name]!, tokens['--cream']!)).toBeGreaterThanOrEqual(4.5);
});
test.each(['--new', '--mod', '--sel', '--trigger', '--violet'])('%s stands out on cream', (name) => {
  expect(contrast(tokens[name]!, tokens['--cream']!)).toBeGreaterThanOrEqual(3);
});

// Colors live in packages/theme/tokens.css only.
test('viewer styles and components hold no color literals', () => {
  for (const file of [stylesCss, ...viewerCodeFiles]) expect(colorLiterals(file), file).toEqual([]);
});

// Depth comes from 1px borders; zero-blur shadows (rings, the stacked card) are allowed.
test('no blurred shadows', () => {
  expect(blurredShadows(stylesCss)).toEqual([]);
});

test('shapes and fonts come from tokens', () => {
  expect(rawShapes(stylesCss)).toEqual([]);
});
