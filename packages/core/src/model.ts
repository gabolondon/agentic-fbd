import type { BlockType, LogicDoc, LogicNode, Ports, TypeExpr, Wire } from './format.ts';

// Shared helpers to look things up in a document: endpoints, ports, scopes.

export interface Endpoint {
  node: string;
  /** undefined when a state node is referenced by its bare id */
  port?: string;
}

export function parseEndpoint(ref: string): Endpoint {
  const dot = ref.indexOf('.');
  if (dot < 0) return { node: ref };
  return { node: ref.slice(0, dot), port: ref.slice(dot + 1) };
}

/** One level of nodes and wires: the file root, or a blockType body. */
export interface Scope {
  /** '' for the file root, otherwise the blockType name. */
  name: string;
  nodes: LogicNode[];
  wires: Wire[];
  byId: Map<string, LogicNode>;
}

export function rootScope(doc: LogicDoc): Scope {
  return makeScope('', doc.nodes, doc.wires);
}

export function bodyScope(name: string, type: BlockType): Scope | null {
  return type.body ? makeScope(name, type.body.nodes, type.body.wires) : null;
}

function makeScope(name: string, nodes: LogicNode[], wires: Wire[]): Scope {
  const byId = new Map<string, LogicNode>();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  return { name, nodes, wires, byId };
}

export type Side = 'inputs' | 'outputs';

/**
 * The ports of a node on one side. Instances inherit from their blockType.
 * With `withBefore`, ports that exist only in `before` are included too
 * (removed wires may attach to them).
 */
export function portsOf(doc: LogicDoc, node: LogicNode, side: Side, withBefore = false): Ports {
  if (node.kind === 'instance') {
    const type = node.of ? doc.blockTypes?.[node.of] : undefined;
    if (!type) return {};
    return withBefore ? { ...(type.before?.[side] ?? {}), ...type[side] } : type[side];
  }
  const current = node[side] ?? {};
  return withBefore ? { ...(node.before?.[side] ?? {}), ...current } : current;
}

/** Type of an endpoint as seen from a wire, or undefined when it cannot be determined. */
export function endpointType(
  doc: LogicDoc,
  node: LogicNode,
  port: string | undefined,
  side: Side,
  withBefore = false,
): TypeExpr | undefined {
  if (port === undefined) return node.kind === 'state' ? node.valueType : undefined;
  return portsOf(doc, node, side, withBefore)[port];
}

export function childrenOf(scope: Scope, groupId: string): LogicNode[] {
  return scope.nodes.filter((n) => n.parent === groupId);
}
