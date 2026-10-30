import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import { logicSchema } from '../schema.ts';
import type { Issue } from './issues.ts';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const check = ajv.compile(logicSchema);

/** Structural validation against the JSON Schema. */
export function validateSchema(doc: unknown): Issue[] {
  if (check(doc)) return [];
  return (check.errors ?? []).filter(relevant).map((e) => {
    const hint = schemaHint(e);
    return {
      level: 'error',
      code: 'schema',
      path: e.instancePath || '/',
      message: describe(e),
      ...(hint === undefined ? {} : { hint }),
    };
  });
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

const SUBJECT_SHAPE = '"subject": { "id", "title", "intent", "mode" }';

// Where a top-level field that models often invent belongs in the format.
const TOP_LEVEL_HOME: Record<string, string> = {
  title: 'move it to "subject.title"',
  description: 'move it to "subject.intent"',
  layers: 'replace it with "nodes" entries of kind "group"',
};

/** One line saying how to fix the error, or undefined when there is nothing specific to say. */
function schemaHint(e: ErrorObject): string | undefined {
  const params = e.params as Record<string, string>;
  if (e.instancePath === '' && e.keyword === 'type') {
    return 'the file must be one JSON object: { "version": "0.1", "subject": {...}, "nodes": [], "wires": [] }';
  }
  switch (e.keyword) {
    case 'additionalProperties':
      return e.instancePath === '' ? (TOP_LEVEL_HOME[params.additionalProperty!] ?? 'remove it') : 'remove it';
    case 'required': {
      const field = params.missingProperty!;
      if (e.instancePath !== '') return `add "${field}" to "${e.instancePath}"`;
      if (field === 'version') return 'set "version": "0.1"';
      if (field === 'subject') return `add ${SUBJECT_SHAPE}`;
      return `add "${field}": [] at the top level`;
    }
    case 'const':
      return e.instancePath === '/version' ? 'set "version": "0.1"' : undefined;
    case 'type':
      return e.instancePath === '/subject' ? `make it an object: ${SUBJECT_SHAPE}` : undefined;
    default:
      return undefined;
  }
}
