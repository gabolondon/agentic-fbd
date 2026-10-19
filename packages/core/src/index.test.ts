import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION } from './index.ts';

describe('core', () => {
  it('exposes the format version', () => {
    expect(FORMAT_VERSION).toBe('0.1');
  });
});
