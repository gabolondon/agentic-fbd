import { describe, expect, it } from 'vitest';
import { formatLayout, layoutFileName, levelKey, parseLayout } from '../src/index.ts';

describe('layout file', () => {
  it('sits next to the diagram', () => {
    expect(layoutFileName('auth-gate.logic.json')).toBe('auth-gate.layout.json');
    expect(levelKey([])).toBe('');
    expect(levelKey(['vaccines', 'other-vaccines'])).toBe('vaccines/other-vaccines');
  });

  it('keeps valid positions, rounded, and drops empty levels and unknown fields', () => {
    const parsed = parseLayout({ version: '0.1', extra: 1, levels: { '': { a: { x: 10.4, y: -3.6, z: 1 } }, empty: {} } });
    expect(parsed).toEqual({ version: '0.1', levels: { '': { a: { x: 10, y: -4 } } } });
  });

  it('rejects anything that is not a layout', () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout({ levels: [] })).toBeNull();
    expect(parseLayout({ levels: { '': { a: { x: '1', y: 2 } } } })).toBeNull();
    expect(parseLayout({ levels: { '': { a: { x: Infinity, y: 2 } } } })).toBeNull();
    expect(parseLayout({ levels: { '': { a: { x: 1e9, y: 2 } } } })).toBeNull();
  });

  it('writes sorted keys, one position per line, and reads back the same', () => {
    const layout = { version: '0.1', levels: { vaccines: { b: { x: 1, y: 2 }, a: { x: 3, y: 4 } }, '': { z: { x: 0, y: 0 } } } };
    const text = formatLayout(layout);
    expect(text).toBe(
      [
        '{',
        '  "version": "0.1",',
        '  "levels": {',
        '    "": {',
        '      "z": { "x": 0, "y": 0 }',
        '    },',
        '    "vaccines": {',
        '      "a": { "x": 3, "y": 4 },',
        '      "b": { "x": 1, "y": 2 }',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    expect(parseLayout(JSON.parse(text))).toEqual(layout);
    expect(formatLayout({ version: '0.1', levels: {} })).toBe('{\n  "version": "0.1",\n  "levels": {}\n}\n');
  });
});
