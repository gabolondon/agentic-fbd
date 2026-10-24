// Style guards shared by the viewer and website tests: colors, radii and fonts come from
// packages/theme/tokens.css, and depth comes from 1px borders, not blurred shadows.
import { readFileSync } from 'node:fs';

export const read = (file: string) => readFileSync(file, 'utf8');
export const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Hex, rgb() and hsl() color literals in a stylesheet or source file. */
export function colorLiterals(file: string): string[] {
  return stripComments(read(file)).match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(|hsla?\(/gi) ?? [];
}

/** [selector, value] for every box-shadow declaration in a stylesheet. */
export function boxShadows(file: string): [string, string][] {
  const out: [string, string][] = [];
  for (const rule of stripComments(read(file)).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    for (const d of rule[2]!.matchAll(/box-shadow:\s*([^;]+);/g)) out.push([rule[1]!.trim(), d[1]!.trim()]);
  }
  return out;
}

/** Shadow layers with a blur above 0, and any drop-shadow() filter. Zero-blur rings are allowed. */
export function blurredShadows(file: string): string[] {
  const out: string[] = [];
  for (const [selector, value] of boxShadows(file)) {
    for (const layer of value.split(/,(?![^(]*\))/)) {
      const lengths = layer.replace(/var\([^)]*\)|inset/g, '').trim().split(/\s+/).filter((t) => /^-?\d/.test(t));
      if (parseFloat(lengths[2] ?? '0') !== 0) out.push(`${selector}: ${layer}`);
    }
  }
  return [...out, ...(stripComments(read(file)).match(/drop-shadow\(/g) ?? [])];
}

/** border-radius and font-family declarations that don't read a token. */
export function rawShapes(file: string): string[] {
  const css = stripComments(read(file));
  return [
    ...(css.match(/border-radius: *(?![ ]|var\(|50%|0;)[^;]+;/g) ?? []),
    ...(css.match(/font-family: *(?![ ]|var\()[^;]+;/g) ?? []),
  ];
}
