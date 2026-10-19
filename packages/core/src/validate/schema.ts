import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { logicSchema } from '../schema.ts';
import type { Issue } from './issues.ts';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const check = ajv.compile(logicSchema);

/** Structural validation against the JSON Schema. */
export function validateSchema(doc: unknown): Issue[] {
  if (check(doc)) return [];
  return (check.errors ?? []).filter(relevant).map((e) => ({
    level: 'error',
    code: 'schema',
    path: e.instancePath || '/',
    message: describe(e),
  }));
}

// anyOf and if/then add wrapper errors that repeat the specific ones; keep the specific ones.
function relevant(e: ErrorObject): boolean {
  return e.keyword !== 'anyOf' && e.keyword !== 'if';
}

function describe(e: ErrorObject): string {
  const at = e.instancePath || 'document';
  switch (e.keyword) {
    case 'required':
      return `${at}: missing required field "${(e.params as { missingProperty: string }).missingProperty}"`;
    case 'additionalProperties':
      return `${at}: unknown field "${(e.params as { additionalProperty: string }).additionalProperty}"`;
    case 'enum':
      return `${at}: must be one of ${JSON.stringify((e.params as { allowedValues: unknown[] }).allowedValues)}`;
    default:
      return `${at}: ${e.message ?? 'is invalid'}`;
  }
}
