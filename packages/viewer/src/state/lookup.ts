import { resolvePath, type LogicDoc, type LogicNode, type Risk, type ViewPath } from '@logic-builder/core';

// Lookups on the document that the panels and risk navigation need.

/** A node from the file root ('' scope) or from a blockType body. */
export function findNode(doc: LogicDoc, scope: string, id: string): LogicNode | undefined {
  const nodes = scope ? doc.blockTypes?.[scope]?.body?.nodes : doc.nodes;
  return nodes?.find((n) => n.id === id);
}

export interface InstanceUse {
  label: string;
  path: ViewPath;
}

/** Every instance of a blockType, at any level, with a path that shows it. */
export function instancesOf(doc: LogicDoc, typeName: string): InstanceUse[] {
  const out: InstanceUse[] = [];
  for (const n of doc.nodes) {
    if (n.kind === 'instance' && n.of === typeName) out.push({ label: n.label, path: containerPath(doc, [], n.parent) });
  }
  for (const [name, type] of Object.entries(doc.blockTypes ?? {})) {
    for (const n of type.body?.nodes ?? []) {
      if (n.kind !== 'instance' || n.of !== typeName) continue;
      const host = doc.nodes.find((h) => h.kind === 'instance' && h.of === name);
      if (host) out.push({ label: `${host.label} › ${n.label}`, path: [host.id] });
    }
  }
  return out;
}

/** The path of the nearest enterable container of a node, so the node is visible. */
function containerPath(doc: LogicDoc, prefix: ViewPath, parent: string | undefined): ViewPath {
  if (parent === undefined) return prefix;
  const candidate = [...prefix, parent];
  const resolved = resolvePath(doc, candidate);
  return resolved.path.length === candidate.length ? candidate : prefix;
}

export interface RiskTarget {
  path: ViewPath;
  /** Ids to highlight in that view: nodes, wires and instances. */
  highlight: Set<string>;
}

/** Where to navigate to show a risk, and what to highlight there. */
export function riskTarget(doc: LogicDoc, risk: Risk): RiskTarget {
  const highlight = new Set<string>();
  let path: ViewPath | undefined;
  for (const ref of risk.refs) {
    const slash = ref.indexOf('/');
    if (slash >= 0) {
      const typeName = ref.slice(0, slash);
      highlight.add(ref.slice(slash + 1));
      const host = doc.nodes.find((n) => n.kind === 'instance' && n.of === typeName);
      if (host && !path) path = [host.id];
      continue;
    }
    highlight.add(ref);
    const node = doc.nodes.find((n) => n.id === ref);
    const wire = doc.wires.find((w) => w.id === ref);
    if (doc.blockTypes?.[ref]) {
      for (const n of doc.nodes) if (n.kind === 'instance' && n.of === ref) highlight.add(n.id);
      continue;
    }
    if (wire) {
      highlight.add(wire.from.split('.')[0]!);
      highlight.add(wire.to.split('.')[0]!);
    }
    const anchor = node ?? (wire ? doc.nodes.find((n) => n.id === wire.from.split('.')[0]) : undefined);
    if (anchor && !path) path = containerPath(doc, [], anchor.parent);
  }
  return { path: path ?? [], highlight };
}

export function risksFor(doc: LogicDoc, scope: string, id: string): Risk[] {
  const key = scope ? `${scope}/${id}` : id;
  return (doc.risks ?? []).filter((r) => r.refs.includes(key));
}
