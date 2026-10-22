import type { TypeExpr } from '../format.ts';
import { parseType, typeToString, type TypeNode } from './parse.ts';

/**
 * Result of checking a wire (design spec §5.6):
 * - ok: same name, or same primitive when neither side is named
 * - warning: compatible shape but the meaning (name) differs, e.g. number -> OptionId
 * - error: incompatible shape
 * - unknown: cannot be evaluated; never shown as red
 */
export type Compat = 'ok' | 'warning' | 'error' | 'unknown';

export type TypeTable = Record<string, TypeExpr>;

const MAX_DEPTH = 24;

export function compat(source: TypeExpr, target: TypeExpr, types: TypeTable = {}): Compat {
  return check(parseType(source), parseType(target), new Resolver(types), 0);
}

/** Expands a named type one level for display, e.g. "Answer = { ... } | { ... }". */
export function describeType(expr: TypeExpr, types: TypeTable = {}): string {
  const t = parseType(expr);
  const shown = typeToString(t);
  if (t.k === 'name') {
    const def = types[t.name];
    return def === undefined ? shown : `${shown} = ${typeToString(parseType(def))}`;
  }
  return shown;
}

/** Names used in an expression that are neither primitives nor defined in `types`. */
export function undefinedNames(expr: TypeExpr, types: TypeTable): string[] {
  return namesIn(expr).filter((name) => !(name in types));
}

/** Every type name an expression mentions, e.g. "Record<QuestionId, Answer>" → QuestionId, Answer. */
export function namesIn(expr: TypeExpr): string[] {
  const out = new Set<string>();
  const walk = (t: TypeNode): void => {
    switch (t.k) {
      case 'name':
        out.add(t.name);
        return;
      case 'array':
      case 'opt':
        return walk(t.of);
      case 'record':
        walk(t.key);
        return walk(t.value);
      case 'struct':
        return Object.values(t.fields).forEach(walk);
      case 'union':
        return t.options.forEach(walk);
      default:
        return;
    }
  };
  walk(parseType(expr));
  return [...out];
}

class Resolver {
  private cache = new Map<string, TypeNode | null>();
  constructor(private types: TypeTable) {}
  resolve(name: string): TypeNode | null {
    if (!this.cache.has(name)) {
      const def = this.types[name];
      this.cache.set(name, def === undefined ? null : parseType(def));
    }
    return this.cache.get(name) ?? null;
  }
}

const RANK: Record<Compat, number> = { ok: 0, unknown: 1, warning: 2, error: 3 };

function worst(results: Compat[]): Compat {
  return results.reduce<Compat>((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
}

function best(results: Compat[]): Compat {
  const order: Compat[] = ['ok', 'warning', 'unknown', 'error'];
  for (const r of order) if (results.includes(r)) return r;
  return 'unknown';
}

/** Names differ but shape fits: the value passes yet means something else. */
function demote(r: Compat): Compat {
  return r === 'ok' ? 'warning' : r;
}

function check(s: TypeNode, t: TypeNode, env: Resolver, depth: number): Compat {
  if (depth > MAX_DEPTH) return 'unknown';
  if (s.k === 'unknown' || t.k === 'unknown') return 'unknown';
  const next = depth + 1;

  // Optionality: T -> T? is fine; T? -> T may be missing.
  if (t.k === 'opt') return check(s.k === 'opt' ? s.of : s, t.of, env, next);
  if (s.k === 'opt') {
    const r = check(s.of, t, env, next);
    return r === 'ok' ? 'warning' : r;
  }

  // Names are nominal.
  if (s.k === 'name' && t.k === 'name') {
    if (s.name === t.name) return 'ok';
    const rs = env.resolve(s.name);
    const rt = env.resolve(t.name);
    if (!rs || !rt) return 'unknown';
    return demote(check(rs, rt, env, next));
  }
  if (s.k === 'name') {
    const rs = env.resolve(s.name);
    return rs ? demote(check(rs, t, env, next)) : 'unknown';
  }
  if (t.k === 'name') {
    const rt = env.resolve(t.name);
    return rt ? demote(check(s, rt, env, next)) : 'unknown';
  }

  // Unions.
  if (s.k === 'union') {
    const results = s.options.map((o) => check(o, t, env, next));
    if (results.every((r) => r === 'error')) return 'error';
    if (results.some((r) => r === 'error')) return 'warning';
    return worst(results);
  }
  if (t.k === 'union') return best(t.options.map((o) => check(s, o, env, next)));

  // Structural.
  switch (s.k) {
    case 'prim':
      if (t.k === 'prim') return s.name === t.name ? 'ok' : 'error';
      if (t.k === 'lit') return s.name === 'string' ? 'warning' : 'error';
      return 'error';
    case 'lit':
      if (t.k === 'lit') return s.value === t.value ? 'ok' : 'error';
      if (t.k === 'prim') return t.name === 'string' ? 'ok' : 'error';
      return 'error';
    case 'array':
      return t.k === 'array' ? check(s.of, t.of, env, next) : 'error';
    case 'record':
      if (t.k === 'record') return worst([check(s.key, t.key, env, next), check(s.value, t.value, env, next)]);
      return t.k === 'struct' ? 'unknown' : 'error';
    case 'struct': {
      if (t.k === 'record') return 'unknown';
      if (t.k !== 'struct') return 'error';
      const results: Compat[] = [];
      for (const [field, tf] of Object.entries(t.fields)) {
        const sf = s.fields[field];
        if (sf === undefined) results.push(tf.k === 'opt' ? 'ok' : 'error');
        else results.push(check(sf, tf, env, next));
      }
      return worst(results);
    }
  }
}
