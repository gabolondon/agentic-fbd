import { resolvePath, type LogicDoc, type LogicNode, type Mark, type NodeKind, type Risk, type ViewPath } from '@logic-builder/core';

export interface TreeItem {
  key: string;
  label: string;
  kind: NodeKind;
  /** The level to show when the item is clicked. */
  path: ViewPath;
  /** Node to select once that level is shown (leaves and closed groups). */
  select?: { scope: string; id: string };
  /** true when clicking opens the item's own level. */
  isLevel: boolean;
  unexplored?: boolean;
  mark?: Mark;
  risk?: boolean;
  children: TreeItem[];
}

/** The document as a navigation tree: groups and instances are levels, other nodes are leaves. */
export function buildTree(doc: LogicDoc): TreeItem[] {
  const openRisks = new Set((doc.risks ?? []).filter((r) => r.status === 'open').flatMap((r) => r.refs));
  const design = doc.subject.mode === 'design';

  const walk = (scope: string, nodes: LogicNode[], parent: string | undefined, prefix: ViewPath, seen: Set<string>): TreeItem[] =>
    nodes
      .filter((n) => n.parent === parent && n.kind !== 'pin')
      .map((n) => {
        const key = scope ? `${scope}/${n.id}` : n.id;
        const type = n.kind === 'instance' && n.of ? doc.blockTypes?.[n.of] : undefined;
        const typeChanged = type?.change === 'modified' || type?.change === 'new';
        const mark: Mark | undefined = !design
          ? undefined
          : n.change === 'new' || n.change === 'modified' || n.change === 'removed'
            ? n.change
            : typeChanged
              ? 'affected'
              : undefined;
        const base = {
          key: `${prefix.join('/')}|${key}`,
          label: n.label,
          kind: n.kind,
          mark,
          risk: openRisks.has(key),
        };
        const here = containerPath(doc, prefix, n.parent);
        if (n.kind === 'group') {
          const children = walk(scope, nodes, n.id, prefix, seen);
          const enterable = n.explored !== false && children.length > 0;
          return {
            ...base,
            path: enterable ? [...prefix, n.id] : here,
            select: enterable ? undefined : { scope, id: n.id },
            isLevel: enterable,
            unexplored: n.explored === false,
            children,
          };
        }
        if (n.kind === 'instance' && type?.body && n.of && !seen.has(n.of)) {
          const inner = new Set(seen).add(n.of);
          return {
            ...base,
            path: [...prefix, n.id],
            isLevel: true,
            children: walk(n.of, type.body.nodes, undefined, [...prefix, n.id], inner),
          };
        }
        return { ...base, path: here, select: { scope, id: n.id }, isLevel: false, children: [] };
      });

  return walk('', doc.nodes, undefined, [], new Set());
}

/** Where a file-root node is shown: the tree item to open for a link like "file#id". */
export function locateNode(doc: LogicDoc, id: string): TreeItem | undefined {
  const stack = [...buildTree(doc)];
  while (stack.length) {
    const item = stack.shift()!;
    if (item.key === `|${id}`) return item;
    stack.push(...item.children);
  }
  return undefined;
}

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
