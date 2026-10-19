import { describe, expect, it } from 'vitest';
import { validateSchema } from '../src/index.ts';
import { baseName, examplesDir, invalidDir, listJson, readJson } from './helpers.ts';

describe('JSON Schema', () => {
  for (const file of listJson(examplesDir)) {
    it(`accepts example ${baseName(file)}`, () => {
      expect(validateSchema(readJson(file))).toEqual([]);
    });
  }

  for (const file of listJson(invalidDir, 'schema-')) {
    it(`rejects ${baseName(file)}`, () => {
      const issues = validateSchema(readJson(file));
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.level === 'error')).toBe(true);
    });
  }
});
