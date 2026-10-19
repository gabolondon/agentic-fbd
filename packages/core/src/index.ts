export const FORMAT_VERSION = '0.1';

export type * from './format.ts';
export { logicSchema } from './schema.ts';
export type { Issue, IssueLevel } from './validate/issues.ts';
export { validateSchema } from './validate/schema.ts';
export { checkIntegrity } from './validate/integrity.ts';
export { validate, validateText, type ValidationResult } from './validate/index.ts';
export { parseType, typeToString, type TypeNode, type Primitive } from './types/parse.ts';
export { compat, describeType, undefinedNames, type Compat, type TypeTable } from './types/compat.ts';
export * from './model.ts';
