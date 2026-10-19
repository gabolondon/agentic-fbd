import type { TypeExpr } from '../format.ts';

// Parsed form of the small type language in design spec §5.6.
export type TypeNode =
  | { k: 'prim'; name: Primitive }
  | { k: 'name'; name: string }
  | { k: 'lit'; value: string }
  | { k: 'array'; of: TypeNode }
  | { k: 'opt'; of: TypeNode }
  | { k: 'record'; key: TypeNode; value: TypeNode }
  | { k: 'struct'; fields: Record<string, TypeNode> }
  | { k: 'union'; options: TypeNode[] }
  | { k: 'unknown'; raw: string };

export type Primitive = 'string' | 'number' | 'boolean' | 'null';

const PRIMITIVES = new Set<string>(['string', 'number', 'boolean', 'null']);
const IDENT = /^[A-Za-z_$][\w$]*$/;

export function parseType(expr: TypeExpr): TypeNode {
  if (typeof expr === 'string') return parseString(expr.trim());
  const keys = Object.keys(expr);
  if (keys.length === 1 && keys[0] === 'oneOf' && Array.isArray((expr as { oneOf: unknown }).oneOf)) {
    return { k: 'union', options: (expr as { oneOf: TypeExpr[] }).oneOf.map(parseType) };
  }
  const fields: Record<string, TypeNode> = {};
  for (const [name, value] of Object.entries(expr as Record<string, TypeExpr>)) fields[name] = parseType(value);
  return { k: 'struct', fields };
}

function parseString(s: string): TypeNode {
  if (s === '') return { k: 'unknown', raw: s };

  const alternatives = splitTopLevel(s, '|');
  if (alternatives.length > 1) return { k: 'union', options: alternatives.map((a) => parseString(a.trim())) };

  if (s.endsWith('?')) return { k: 'opt', of: parseString(s.slice(0, -1).trim()) };
  if (s.endsWith('[]')) return { k: 'array', of: parseString(s.slice(0, -2).trim()) };
  if (s.startsWith('(') && s.endsWith(')')) return parseString(s.slice(1, -1).trim());

  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return { k: 'lit', value: s.slice(1, -1) };

  const record = /^Record\s*<(.*)>$/.exec(s);
  if (record) {
    const args = splitTopLevel(record[1] ?? '', ',');
    if (args.length === 2) return { k: 'record', key: parseString(args[0]!.trim()), value: parseString(args[1]!.trim()) };
    return { k: 'unknown', raw: s };
  }

  if (PRIMITIVES.has(s)) return { k: 'prim', name: s as Primitive };
  if (IDENT.test(s)) return { k: 'name', name: s };
  return { k: 'unknown', raw: s };
}

/** Splits on `sep` outside of <>, () and quotes. */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") quoted = !quoted;
    else if (quoted) continue;
    else if (c === '<' || c === '(') depth++;
    else if (c === '>' || c === ')') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/** Renders a parsed type back to the compact string syntax. */
export function typeToString(t: TypeNode): string {
  switch (t.k) {
    case 'prim':
      return t.name;
    case 'name':
      return t.name;
    case 'lit':
      return `'${t.value}'`;
    case 'array':
      return `${wrap(t.of)}[]`;
    case 'opt':
      return `${wrap(t.of)}?`;
    case 'record':
      return `Record<${typeToString(t.key)}, ${typeToString(t.value)}>`;
    case 'struct': {
      const fields = Object.entries(t.fields).map(([n, v]) => `${n}: ${typeToString(v)}`);
      return `{ ${fields.join(', ')} }`;
    }
    case 'union':
      return t.options.map(typeToString).join(' | ');
    case 'unknown':
      return t.raw;
  }
}

function wrap(t: TypeNode): string {
  return t.k === 'union' ? `(${typeToString(t)})` : typeToString(t);
}
