import type { LogicDoc } from '../format.ts';
import { checkIntegrity } from './integrity.ts';
import type { Issue } from './issues.ts';
import { validateSchema } from './schema.ts';

export interface ValidationResult {
  /** false when there is at least one error; warnings and notices don't fail validation. */
  valid: boolean;
  issues: Issue[];
}

export function validate(doc: unknown): ValidationResult {
  const schemaIssues = validateSchema(doc);
  // Integrity checks assume the shape the schema guarantees.
  const issues = schemaIssues.length ? schemaIssues : checkIntegrity(doc as LogicDoc);
  return { valid: !issues.some((i) => i.level === 'error'), issues };
}

/** Parses JSON text and validates it; a parse failure is reported as an error issue. */
export function validateText(text: string): ValidationResult & { doc: LogicDoc | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, doc: null, issues: [{ level: 'error', code: 'json', path: '/', message: `invalid JSON: ${message}` }] };
  }
  const result = validate(parsed);
  return { ...result, doc: result.issues.some((i) => i.code === 'schema') ? null : (parsed as LogicDoc) };
}
