import type { LogicDoc, LogicNode, TypeExpr, Wire } from '../format.ts';
import {
  bodyScope,
  childrenOf,
  endpointType,
  parseEndpoint,
  portsOf,
  rootScope,
  type Scope,
  type Side,
} from '../model.ts';
import { compat, undefinedNames } from '../types/compat.ts';
import { parseType, typeToString } from '../types/parse.ts';
import type { Issue } from './issues.ts';

/** Reference and consistency checks that JSON Schema cannot express (design spec §7). */
export function checkIntegrity(doc: LogicDoc): Issue[] {
  const issues: Issue[] = [];
  const types = doc.types ?? {};
  const blockTypes = doc.blockTypes ?? {};
  const root = rootScope(doc);

  checkRootIds(doc, issues);
  checkScope(doc, root, issues);

  for (const [name, type] of Object.entries(blockTypes)) {
    const body = bodyScope(name, type);
    if (!body) continue;
    checkUnique(body.nodes, body.wires, `blockTypes/${name}/body`, issues);
    checkScope(doc, body, issues);
    checkPins(name, type.inputs, type.outputs, body, issues);
  }

  checkBodyCycles(doc, issues);
  checkRisks(doc, root, issues);
  checkFocus(doc, root, issues);
  checkTypeNames(doc, types, issues);
  checkTypeInfo(doc, types, issues);
  checkStores(doc, issues);
  checkExplanations(doc, issues);
  return issues;
}

function checkTypeInfo(doc: LogicDoc, types: Record<string, TypeExpr>, issues: Issue[]): void {
  for (const name of Object.keys(doc.typeInfo ?? {})) {
    if (!(name in types)) err(issues, 'unknown-type-info', `typeInfo/${name}`, `typeInfo "${name}" describes a type that is not in "types"`);
  }
}

/** Each state should say where its data lives; a new state should not copy an existing one. */
function checkStores(doc: LogicDoc, issues: Issue[]): void {
  const noStore: string[] = [];
  const visit = (nodes: LogicNode[], prefix: string): void => {
    const states = nodes.filter((n) => n.kind === 'state');
    for (const n of states) if (n.store === undefined) noStore.push(prefix + n.id);
    const shown = (n: LogicNode): string | undefined => (n.valueType === undefined ? undefined : typeToString(parseType(n.valueType)));
    const existing = states.filter((n) => n.change !== 'new' && n.change !== 'removed');
    for (const n of states.filter((s) => s.change === 'new')) {
      const type = shown(n);
      const twin = type === undefined ? undefined : existing.find((e) => shown(e) === type);
      if (!twin) continue;
      issues.push({
        level: 'notice',
        code: 'similar-store',
        path: prefix + n.id,
        message: `new state "${prefix + n.id}" holds the same type as existing "${prefix + twin.id}"; reuse it if it holds the same data`,
      });
    }
  };
  visit(doc.nodes, '');
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) visit(type.body?.nodes ?? [], `${name}/`);
  if (noStore.length) {
    issues.push({ level: 'notice', code: 'missing-store', path: noStore[0]!, message: `${noStore.length} state(s) have no "store" (where the data lives): ${listIds(noStore)}` });
  }
}

function listIds(ids: string[]): string {
  return ids.length > 6 ? `${ids.slice(0, 6).join(', ')} and ${ids.length - 6} more` : ids.join(', ');
}

/** Kinds whose inner workings deserve a step-by-step `logic` guide. */
const NEEDS_LOGIC = new Set(['function', 'decision']);

/** The reader relies on desc/logic to understand each block; report what is missing. */
function checkExplanations(doc: LogicDoc, issues: Issue[]): void {
  const noDesc: string[] = [];
  const noLogic: string[] = [];
  const visit = (nodes: LogicNode[], prefix: string): void => {
    for (const n of nodes) {
      if (n.kind === 'pin' || n.kind === 'instance') continue;
      if (!n.desc) noDesc.push(prefix + n.id);
      if (NEEDS_LOGIC.has(n.kind) && !n.logic) noLogic.push(prefix + n.id);
    }
  };
  visit(doc.nodes, '');
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) {
    if (!type.desc) noDesc.push(name);
    if (!type.logic) noLogic.push(name);
    visit(type.body?.nodes ?? [], `${name}/`);
  }
  const list = listIds;
  if (noDesc.length) {
    issues.push({ level: 'notice', code: 'missing-desc', path: noDesc[0]!, message: `${noDesc.length} block(s) have no "desc" (what it does): ${list(noDesc)}` });
  }
  if (noLogic.length) {
    issues.push({ level: 'notice', code: 'missing-logic', path: noLogic[0]!, message: `${noLogic.length} block(s) have no "logic" guide (how it works): ${list(noLogic)}` });
  }
}

function err(issues: Issue[], code: string, path: string, message: string): void {
  issues.push({ level: 'error', code, path, message });
}

function checkRootIds(doc: LogicDoc, issues: Issue[]): void {
  const seen = new Map<string, string>();
  const add = (id: string, what: string): void => {
    const prev = seen.get(id);
    if (prev) err(issues, 'duplicate-id', id, `id "${id}" is used by both a ${prev} and a ${what}`);
    else seen.set(id, what);
  };
  for (const n of doc.nodes) add(n.id, 'node');
  for (const w of doc.wires) add(w.id, 'wire');
  for (const name of Object.keys(doc.blockTypes ?? {})) add(name, 'blockType');
  for (const r of doc.risks ?? []) add(r.id, 'risk');
}

function checkUnique(nodes: LogicNode[], wires: Wire[], path: string, issues: Issue[]): void {
  const seen = new Set<string>();
  for (const item of [...nodes, ...wires]) {
    if (seen.has(item.id)) err(issues, 'duplicate-id', `${path}/${item.id}`, `id "${item.id}" is used twice in ${path}`);
    seen.add(item.id);
  }
}

function where(scope: Scope, id: string): string {
  return scope.name ? `${scope.name}/${id}` : id;
}

function checkScope(doc: LogicDoc, scope: Scope, issues: Issue[]): void {
  for (const node of scope.nodes) checkNode(doc, scope, node, issues);
  checkParentCycles(scope, issues);
  for (const wire of scope.wires) checkWire(doc, scope, wire, issues);
}

function checkNode(doc: LogicDoc, scope: Scope, node: LogicNode, issues: Issue[]): void {
  const at = where(scope, node.id);

  for (const [field, parent] of [
    ['parent', node.parent],
    ['before.parent', node.before?.parent],
  ] as const) {
    if (parent === undefined) continue;
    const p = scope.byId.get(parent);
    if (!p) err(issues, 'unknown-parent', at, `node "${at}" has ${field} "${parent}", which does not exist`);
    else if (p.kind !== 'group') err(issues, 'parent-not-group', at, `node "${at}" has ${field} "${parent}", which is a ${p.kind}, not a group`);
  }

  if (node.kind === 'instance' && node.of !== undefined && !doc.blockTypes?.[node.of]) {
    err(issues, 'unknown-blocktype', at, `instance "${at}" is of "${node.of}", which is not a blockType`);
  }

  if (node.kind === 'pin' && !scope.name) {
    err(issues, 'pin-outside-body', at, `pin "${at}" is only allowed inside a blockType body`);
  }

  if (node.kind === 'pin' && node.see !== undefined) {
    err(issues, 'pin-see', at, `pin "${at}" cannot link to another diagram ("see"); link the instance or a block instead`);
  }

  if (node.kind === 'group') {
    const hasPorts = Object.keys(node.inputs ?? {}).length + Object.keys(node.outputs ?? {}).length > 0;
    const hasChildren = childrenOf(scope, node.id).length > 0;
    if (hasChildren && node.explored === false) {
      err(issues, 'unexplored-with-children', at, `group "${at}" is marked explored: false but has children; drop "explored" once it is explored`);
    }
    if (hasPorts && hasChildren) {
      err(issues, 'group-ports-and-children', at, `group "${at}" has both children and declared ports; once explored, rewire its wires to the children and remove the ports`);
    } else if (hasPorts && node.explored !== false) {
      err(issues, 'ports-on-explored-group', at, `group "${at}" declares ports but is not marked explored: false; only unexplored groups declare ports`);
    }
  }

  if (node.before && node.change !== 'modified') {
    issues.push({ level: 'notice', code: 'before-unused', path: at, message: `node "${at}" has "before" but is not marked modified; it is ignored` });
  }
}

function checkParentCycles(scope: Scope, issues: Issue[]): void {
  for (const start of scope.nodes) {
    const seen = new Set<string>([start.id]);
    let cur = start.parent;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        err(issues, 'parent-cycle', where(scope, start.id), `node "${where(scope, start.id)}" is inside a parent cycle`);
        break;
      }
      seen.add(cur);
      cur = scope.byId.get(cur)?.parent;
    }
  }
}

function checkWire(doc: LogicDoc, scope: Scope, wire: Wire, issues: Issue[]): void {
  const at = where(scope, wire.id);
  const removed = wire.change === 'removed';
  const from = resolveEnd(doc, scope, wire.from, 'outputs', removed, at, 'from', issues);
  const to = resolveEnd(doc, scope, wire.to, 'inputs', removed, at, 'to', issues);
  if (wire.before?.from) resolveEnd(doc, scope, wire.before.from, 'outputs', true, at, 'before.from', issues);
  if (wire.before?.to) resolveEnd(doc, scope, wire.before.to, 'inputs', true, at, 'before.to', issues);

  if (!from || !to || removed) return;
  if (from.type === undefined || to.type === undefined) return;
  const result = compat(from.type, to.type, doc.types ?? {});
  const shown = `${typeToString(parseType(from.type))} -> ${typeToString(parseType(to.type))}`;
  if (result === 'error') {
    err(issues, 'type-mismatch', at, `wire "${at}" (${wire.from} -> ${wire.to}) connects incompatible types: ${shown}`);
  } else if (result === 'warning') {
    issues.push({
      level: 'warning',
      code: 'type-meaning',
      path: at,
      message: `wire "${at}" (${wire.from} -> ${wire.to}) fits by shape but the types differ in meaning: ${shown}`,
    });
  }
}

function resolveEnd(
  doc: LogicDoc,
  scope: Scope,
  ref: string,
  side: Side,
  withBefore: boolean,
  at: string,
  field: string,
  issues: Issue[],
): { type: TypeExpr | undefined } | null {
  const end = parseEndpoint(ref);
  const node = scope.byId.get(end.node);
  if (!node) {
    err(issues, 'unknown-node', at, `wire "${at}" ${field} "${ref}": node "${end.node}" does not exist${scope.name ? ` in ${scope.name}'s body` : ''}`);
    return null;
  }
  if (end.port === undefined) {
    if (node.kind !== 'state') {
      err(issues, 'missing-port', at, `wire "${at}" ${field} "${ref}": only state nodes may be referenced without a port; use "${node.id}.<port>"`);
      return null;
    }
    return { type: node.valueType };
  }
  if (node.kind === 'state') {
    err(issues, 'state-port', at, `wire "${at}" ${field} "${ref}": state nodes are referenced by their id alone, use "${node.id}"`);
    return null;
  }
  const ports = portsOf(doc, node, side, withBefore);
  if (!(end.port in ports)) {
    const known = Object.keys(ports);
    const list = known.length ? known.join(', ') : 'none';
    err(issues, 'unknown-port', at, `wire "${at}" ${field} "${ref}": "${node.id}" has no ${side === 'inputs' ? 'input' : 'output'} "${end.port}" (${side}: ${list})`);
    return null;
  }
  return { type: endpointType(doc, node, end.port, side, withBefore) };
}

function checkPins(
  typeName: string,
  inputs: Record<string, TypeExpr>,
  outputs: Record<string, TypeExpr>,
  body: Scope,
  issues: Issue[],
): void {
  for (const pin of body.nodes.filter((n) => n.kind === 'pin')) {
    const at = where(body, pin.id);
    const ins = Object.entries(pin.inputs ?? {});
    const outs = Object.entries(pin.outputs ?? {});
    if (ins.length + outs.length !== 1) {
      err(issues, 'pin-ports', at, `pin "${at}" must have exactly one port (an output for a block input, or an input for a block output)`);
      continue;
    }
    // An input pin feeds the body, so it exposes one output named after the block input.
    const [name, type] = (outs[0] ?? ins[0])!;
    const declared = outs.length ? inputs : outputs;
    const side = outs.length ? 'input' : 'output';
    if (!(name in declared)) {
      err(issues, 'pin-mismatch', at, `pin "${at}" stands for block ${side} "${name}", but ${typeName} has no ${side} with that name`);
    } else if (typeToString(parseType(declared[name]!)) !== typeToString(parseType(type))) {
      err(issues, 'pin-mismatch', at, `pin "${at}" has type ${typeToString(parseType(type))}, but ${typeName}.${name} is ${typeToString(parseType(declared[name]!))}`);
    }
  }
}

function checkBodyCycles(doc: LogicDoc, issues: Issue[]): void {
  const types = doc.blockTypes ?? {};
  const uses = (name: string): string[] =>
    (types[name]?.body?.nodes ?? []).filter((n) => n.kind === 'instance' && n.of).map((n) => n.of!);
  for (const start of Object.keys(types)) {
    const stack = [...uses(start)];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === start) {
        err(issues, 'body-cycle', `blockTypes/${start}`, `blockType "${start}" contains itself through its body`);
        break;
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...uses(cur));
    }
  }
}

function checkRisks(doc: LogicDoc, root: Scope, issues: Issue[]): void {
  const wireIds = new Set(doc.wires.map((w) => w.id));
  const types = doc.blockTypes ?? {};
  for (const risk of doc.risks ?? []) {
    for (const ref of risk.refs) {
      const slash = ref.indexOf('/');
      let ok: boolean;
      if (slash >= 0) {
        const body = types[ref.slice(0, slash)]?.body;
        const inner = ref.slice(slash + 1);
        ok = !!body && (body.nodes.some((n) => n.id === inner) || body.wires.some((w) => w.id === inner));
      } else {
        ok = root.byId.has(ref) || wireIds.has(ref) || ref in types;
      }
      if (!ok) err(issues, 'unknown-ref', risk.id, `risk "${risk.id}" refers to "${ref}", which does not exist`);
    }
  }
}

function checkFocus(doc: LogicDoc, root: Scope, issues: Issue[]): void {
  const focus = doc.subject.focus;
  if (focus === undefined) return;
  const node = root.byId.get(focus);
  if (!node || (node.kind !== 'group' && node.kind !== 'instance')) {
    err(issues, 'unknown-focus', 'subject.focus', `subject.focus "${focus}" must be the id of a group or instance`);
  }
}

function checkTypeNames(doc: LogicDoc, types: Record<string, TypeExpr>, issues: Issue[]): void {
  const exprs: TypeExpr[] = [...Object.values(types)];
  const collect = (nodes: LogicNode[]): void => {
    for (const n of nodes) {
      exprs.push(...Object.values(n.inputs ?? {}), ...Object.values(n.outputs ?? {}));
      if (n.valueType !== undefined) exprs.push(n.valueType);
    }
  };
  collect(doc.nodes);
  for (const t of Object.values(doc.blockTypes ?? {})) {
    exprs.push(...Object.values(t.inputs), ...Object.values(t.outputs));
    collect(t.body?.nodes ?? []);
  }
  const missing = new Set<string>();
  for (const e of exprs) for (const name of undefinedNames(e, types)) missing.add(name);
  for (const name of missing) {
    issues.push({
      level: 'notice',
      code: 'undefined-type',
      path: `types/${name}`,
      message: `type "${name}" is not defined in "types"; it is treated as opaque`,
    });
  }
}
