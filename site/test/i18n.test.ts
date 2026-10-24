import { expect, test } from 'vitest';
import en from '../src/i18n/en.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };

// Every leaf string, keyed by its dotted path.
function flat(tree: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out[prefix + key] = value;
    else Object.assign(out, flat(value as object, `${prefix}${key}.`));
  }
  return out;
}

test('es.json has exactly the keys of en.json, none empty', () => {
  expect(Object.keys(flat(es)).sort()).toEqual(Object.keys(flat(en)).sort());
  for (const strings of [flat(en), flat(es)]) {
    expect(Object.entries(strings).filter(([, v]) => !v.trim())).toEqual([]);
  }
});
