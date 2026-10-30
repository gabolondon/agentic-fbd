import type { Issue, LogicDoc } from '@agentic-fbd/core';
import { PLACEHOLDER } from './starter.ts';

/**
 * Errors for every text that still starts with TODO (left over from `new`). CLI-only: the viewer
 * does not run this, so it can show a fresh starter without an error banner.
 */
export function checkPlaceholders(doc: LogicDoc): Issue[] {
  const issues: Issue[] = [];
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (value.startsWith(PLACEHOLDER)) {
        issues.push({
          level: 'error',
          code: 'placeholder',
          path,
          message: `placeholder text left at ${path}: "${value}"`,
          hint: 'replace the TODO text with the real content',
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}/${i}`));
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`);
    }
  };
  visit(doc, '');
  return issues;
}
