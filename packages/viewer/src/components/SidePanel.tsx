import { useState } from 'react';
import {
  copyReference,
  describeType,
  typedItem,
  type Edit,
  type ItemRef,
  type LogicDoc,
  type LogicGuide,
  type LogicNode,
  type Ports,
  type Risk,
  type TriggerSource,
  type ViewMode,
  type ViewEdge,
  type ViewNode,
  type ViewPath,
} from '@agentic-fbd/core';
import { findNode, instancesOf, risksFor } from '../state/lookup.ts';
import { DataBox, DataRow } from './DataBox.tsx';
import { EditableText } from './Editable.tsx';
import { KIND_LABEL } from './nodes.tsx';

export type Panel =
  | { type: 'node'; node: ViewNode }
  | { type: 'unexplored'; node: ViewNode }
  | { type: 'risks' }
  /** A wire of the level on screen; `scope` is that level's scope. */
  | { type: 'wire'; edge: ViewEdge; scope: string }
  /** Several blocks selected on the canvas. */
  | { type: 'selection'; refs: ItemRef[] }
  | null;

interface Props {
  panel: Panel;
  doc: LogicDoc;
  filePath: string;
  mode: ViewMode;
  showChanges: boolean;
  onClose: () => void;
  onNavigate: (path: ViewPath) => void;
  /** Follows a `see` link to another diagram. */
  onOpenLink: (see: string) => void;
  onRisk: (risk: Risk) => void;
  activeRisk: string | null;
  /** Opens the level that shows a block and selects it. */
  onSelect: (scope: string, id: string) => void;
  /** Applies an edit to the draft; returns why it was refused, or null. */
  edit: (e: Edit) => string | null;
  /** The diagram when editing started, while there is a draft. */
  original: LogicDoc | null;
}

export function SidePanel(props: Props) {
  const { panel } = props;
  return (
    <aside className={`lb-panel${panel ? ' lb-panel-open' : ''}`} aria-hidden={!panel}>
      {panel && (
        <div className="lb-panel-inner">
          <button className="lb-panel-close" onClick={props.onClose} aria-label="Close">
            ×
          </button>
          {panel.type === 'risks' && <RisksPanel {...props} />}
          {panel.type === 'node' && <NodePanel key={panel.node.id} {...props} node={panel.node} />}
          {panel.type === 'unexplored' && <UnexploredPanel {...props} node={panel.node} />}
          {panel.type === 'wire' && <WirePanel key={panel.edge.wireIds[0]} {...props} edge={panel.edge} scope={panel.scope} />}
          {panel.type === 'selection' && <SelectionPanel {...props} refs={panel.refs} />}
        </div>
      )}
    </aside>
  );
}

function PortList({ title, ports, doc }: { title: string; ports: Ports | undefined; doc: LogicDoc }) {
  const entries = Object.entries(ports ?? {});
  if (!entries.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      {entries.map(([name, type]) => (
        <div key={name} className="lb-port-row">
          <code>{name}</code> <span className="lb-muted">:</span> <span className="lb-type">{describeType(type, doc.types ?? {})}</span>
        </div>
      ))}
    </section>
  );
}

function Explanation({ desc, logic, onDesc }: { desc?: string; logic?: LogicGuide; onDesc?: (v: string) => string | null }) {
  if (!desc && !logic && !onDesc) {
    return <p className="lb-muted lb-no-explanation">No explanation yet. Ask the agent to describe this block.</p>;
  }
  return (
    <div className="lb-explanation">
      {(desc || onDesc) && (
        <section>
          <h4>What it does</h4>
          <div className="lb-desc">
            <EditableText value={desc ?? ''} multiline placeholder="Add a description" label="What it does" onCommit={onDesc} />
          </div>
        </section>
      )}
      {logic && (
        <section>
          <h4>How it works</h4>
          {Array.isArray(logic) ? (
            <ol className="lb-steps">
              {logic.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p>{logic}</p>
          )}
        </section>
      )}
    </div>
  );
}

const SOURCES: TriggerSource[] = ['user', 'schedule', 'http', 'agent', 'system'];

/** A trigger's source and context; `from` and `modes` can be edited. */
function TriggerContext({ node, onCommit }: { node: LogicNode; onCommit?: (source: TriggerSource, context: Record<string, unknown>) => string | null }) {
  const context = node.context ?? {};
  const source = node.source ?? 'user';
  const setKey = (key: string, value: unknown): string | null => {
    const next = { ...context };
    if (value === '' || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    return onCommit!(source, next);
  };
  const shown = (val: unknown): string => (Array.isArray(val) ? val.join(', ') : String(val ?? ''));
  const keys = [...new Set([...(onCommit ? ['from', 'modes'] : []), ...Object.keys(context)])];
  return (
    <section>
      <h4>Context</h4>
      <div className="lb-context-row">
        source:{' '}
        {onCommit ? (
          <select className="lb-select" aria-label="Trigger source" value={source} onChange={(e) => onCommit(e.target.value as TriggerSource, context)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <code>{source}</code>
        )}
      </div>
      {keys.map((k) => {
        const editable = onCommit && (k === 'from' || (k === 'modes' && (context.modes === undefined || Array.isArray(context.modes))));
        const commit = !editable
          ? undefined
          : k === 'modes'
            ? (v: string) => setKey(k, v.split(',').map((m) => m.trim()).filter(Boolean))
            : (v: string) => setKey(k, v.trim());
        return (
          <div key={k} className="lb-context-row">
            {k}:{' '}
            <code>
              <EditableText value={shown(context[k])} mono placeholder={k === 'modes' ? 'create, edit' : 'where it starts'} label={`Trigger ${k}`} onCommit={commit} />
            </code>
          </div>
        );
      })}
    </section>
  );
}

/** Remove, with a confirm for a group; Restore for a block removed while editing. */
function RemoveFooter({ inside, restorable, onRemove, onRestore }: { inside: number; restorable: boolean; onRemove?: () => string | null; onRestore: () => string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="lb-panel-footer">
      {restorable ? (
        <button className="lb-pill" onClick={() => setError(onRestore())}>
          Restore
        </button>
      ) : confirming ? (
        <div className="lb-confirm">
          <span>
            Removes this block and {inside} inside it
          </span>
          <span className="lb-spacer" />
          <button className="lb-pill lb-pill-small" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button className="lb-pill lb-pill-small lb-pill-danger" onClick={() => setError(onRemove!())}>
            Remove
          </button>
        </div>
      ) : (
        onRemove && (
          <button className="lb-pill lb-pill-danger" onClick={() => (inside > 0 ? setConfirming(true) : setError(onRemove()))}>
            Remove
          </button>
        )
      )}
      {error && (
        <span className="lb-edit-error" role="alert">
          {error}
        </span>
      )}
    </section>
  );
}

/** How many blocks sit inside a group, at any depth. */
function countInside(nodes: LogicNode[], id: string): number {
  const inside = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) {
      if (n.parent !== undefined && inside.has(n.parent) && !inside.has(n.id)) {
        inside.add(n.id);
        grew = true;
      }
    }
  }
  return inside.size - 1;
}

const CHANGE_TAG: Record<string, string> = { new: 'new', modified: 'modified', removed: 'removed', affected: 'affected' };

/** Copies text, and says so for a moment. */
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };
  return [copied, copy];
}

/** The icon in a panel header that copies a reference to the block or wire for a prompt. */
function CopyReference({ doc, filePath, target }: { doc: LogicDoc; filePath: string; target: ItemRef }) {
  const [copied, copy] = useCopy();
  return (
    <button className="lb-copy" aria-label="Copy reference for agent" title="Copy reference for agent" onClick={() => copy(copyReference(doc, filePath, [target]))}>
      {copied ? 'Copied' : '⧉'}
    </button>
  );
}

function NodePanel({ node, doc, filePath, mode, showChanges, onNavigate, onOpenLink, onSelect, edit, original }: Props & { node: ViewNode }) {
  if (!node.ref) {
    return (
      <>
        <div className="lb-kind">Boundary</div>
        <h3>{node.label}</h3>
        <p>
          Connection to <code>{node.outsideRef}</code>, which is outside this level.
        </p>
      </>
    );
  }
  const at = node.ref;
  const source = findNode(doc, at.scope, at.id);
  if (!source) return null;
  const type = source.kind === 'instance' && source.of ? doc.blockTypes?.[source.of] : undefined;
  const code = source.code ?? type?.code;
  const risks = risksFor(doc, at.scope, at.id);
  const uses = source.kind === 'instance' && source.of ? instancesOf(doc, source.of) : [];
  const mark = showChanges ? node.mark : undefined;
  const changeNote = showChanges ? (source.changeNote ?? (node.mark === 'affected' ? type?.changeNote : undefined)) : undefined;

  // Edits happen in the After view, never on pins or on removed blocks (design spec §6.9).
  const removed = source.change === 'removed';
  const canEdit = mode === 'after' && source.kind !== 'pin' && !removed;
  const commit = (e: Edit): string | null => edit(e);
  const was = original ? findNode(original, at.scope, at.id) : undefined;
  const restorable = mode === 'after' && removed && !!was && was.change !== 'removed';
  const scopeNodes = (at.scope ? doc.blockTypes?.[at.scope]?.body?.nodes : doc.nodes) ?? [];

  return (
    <>
      <div className="lb-kind">{KIND_LABEL[source.kind]}</div>
      <CopyReference doc={doc} filePath={filePath} target={at} />
      <h3>
        <EditableText value={source.label} label="Block name" onCommit={canEdit ? (value) => commit({ op: 'setLabel', at, value }) : undefined} />
        {mark && <span className={`lb-tag lb-tag-${mark}`}>{CHANGE_TAG[mark]}</span>}
      </h3>
      <Explanation
        desc={source.desc ?? type?.desc}
        logic={source.logic ?? type?.logic}
        onDesc={canEdit ? (value) => commit({ op: 'setDesc', at, value }) : undefined}
      />
      {source.see && (
        <section>
          <h4>Explained in another diagram</h4>
          <button className="lb-button lb-open-link" onClick={() => onOpenLink(source.see!)}>
            Open {source.see.replace('#', ' › ')} ↗
          </button>
        </section>
      )}
      {source.kind === 'trigger' && (
        <TriggerContext node={source} onCommit={canEdit ? (src, context) => commit({ op: 'setTrigger', at, source: src, context }) : undefined} />
      )}
      <DataBox
        key={`${at.scope}/${at.id}`}
        doc={doc}
        scope={at.scope}
        id={at.id}
        mode={mode}
        onSelect={onSelect}
        edit={canEdit ? commit : undefined}
        shared={source.kind === 'instance' && source.of ? { typeName: source.of, uses: uses.length } : undefined}
      />
      {(code || source.ref) && (
        <section>
          <h4>Code</h4>
          {code ? (
            <code>
              {code.file}
              {(code.symbol || canEdit) && ' › '}
              <EditableText value={code.symbol ?? ''} mono placeholder="name a function" label="Function name" onCommit={canEdit ? (value) => commit({ op: 'setSymbol', at, value }) : undefined} />
            </code>
          ) : (
            <span>{source.ref}</span>
          )}
        </section>
      )}
      {changeNote && (
        <section>
          <h4>What changes</h4>
          <p>{changeNote}</p>
          {source.before?.inputs && <PortList title="Inputs before" ports={source.before.inputs} doc={doc} />}
          {source.before?.outputs && <PortList title="Outputs before" ports={source.before.outputs} doc={doc} />}
        </section>
      )}
      {uses.length > 0 && (
        <section>
          <h4>
            Instances of “{type?.label ?? source.of}” · used in {uses.length} {uses.length === 1 ? 'place' : 'places'}
          </h4>
          {uses.map((u, i) => (
            <button key={i} className="lb-link" onClick={() => onNavigate(u.path)}>
              {u.label}
            </button>
          ))}
        </section>
      )}
      {risks.length > 0 && (
        <section>
          <h4>Risks</h4>
          {risks.map((r) => (
            <div key={r.id} className={`lb-risk lb-risk-${r.severity} lb-risk-${r.status}`}>
              <b>{r.title}</b>
              <div className="lb-muted">{r.status}</div>
            </div>
          ))}
        </section>
      )}
      {(canEdit || source.note) && (
        <section className="lb-note-section">
          <h4>Note for agent</h4>
          <EditableText value={source.note ?? ''} multiline placeholder="Add a note" label="Note for agent" onCommit={canEdit ? (value) => commit({ op: 'setNote', at, value }) : undefined} />
        </section>
      )}
      {node.enterable && node.type !== 'frame' && !node.unexplored && <p className="lb-muted">Double-click to see inside.</p>}
      {(canEdit || restorable) && (
        <RemoveFooter
          inside={source.kind === 'group' ? countInside(scopeNodes, at.id) : 0}
          restorable={restorable}
          onRemove={canEdit ? () => commit({ op: 'remove', at }) : undefined}
          onRestore={() => commit({ op: 'restore', at })}
        />
      )}
    </>
  );
}

/** A wire: what it carries, a note for the agent, and remove or restore (design spec §6.9). */
function WirePanel({ edge, scope, doc, filePath, mode, showChanges, edit, original }: Props & { edge: ViewEdge; scope: string }) {
  const items = scope ? doc.blockTypes?.[scope]?.body : doc;
  const wire = items?.wires.find((w) => w.id === edge.wireIds[0]);
  if (!wire) return null;
  const at = { scope, id: wire.id };
  const removed = wire.change === 'removed';
  const canEdit = mode === 'after' && !removed;
  const was = (scope ? original?.blockTypes?.[scope]?.body : original)?.wires.find((w) => w.id === wire.id);
  const restorable = mode === 'after' && removed && !!was && was.change !== 'removed';
  const mark = showChanges && (wire.change === 'new' || wire.change === 'modified' || wire.change === 'removed') ? wire.change : undefined;
  const item = edge.type === undefined ? null : typedItem(doc, 'value', edge.type);
  return (
    <>
      <div className="lb-kind">Wire</div>
      <CopyReference doc={doc} filePath={filePath} target={at} />
      <h3>
        <code className="lb-wire-title">
          {wire.from} → {wire.to}
        </code>
        {mark && <span className={`lb-tag lb-tag-${mark}`}>{CHANGE_TAG[mark]}</span>}
      </h3>
      {item && (
        <section className="lb-data lb-data-open">
          <div className="lb-data-body">
            <h4>Carries</h4>
            <DataRow item={item} />
          </div>
        </section>
      )}
      {wire.op && (
        <section>
          <h4>Operation</h4>
          {wire.op === 'read' ? 'Reads the state' : 'Writes the state'}
        </section>
      )}
      {(canEdit || wire.note) && (
        <section className="lb-note-section">
          <h4>Note for agent</h4>
          <EditableText value={wire.note ?? ''} multiline placeholder="Add a note" label="Note for agent" onCommit={canEdit ? (value) => edit({ op: 'setNote', at, value }) : undefined} />
        </section>
      )}
      {(canEdit || restorable) && (
        <RemoveFooter inside={0} restorable={restorable} onRemove={canEdit ? () => edit({ op: 'remove', at }) : undefined} onRestore={() => edit({ op: 'restore', at })} />
      )}
    </>
  );
}

/** Several blocks selected on the canvas: one reference for all of them. */
function SelectionPanel({ refs, doc, filePath }: Props & { refs: ItemRef[] }) {
  const [copied, copy] = useCopy();
  const labels = refs.map((r) => findNode(doc, r.scope, r.id)?.label ?? r.id);
  return (
    <>
      <div className="lb-kind">Selection</div>
      <h3>{refs.length} blocks selected</h3>
      <ul className="lb-selection">
        {labels.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <button className="lb-button" onClick={() => copy(copyReference(doc, filePath, refs))}>
        {copied ? 'Copied' : 'Copy for agent'}
      </button>
      <p className="lb-muted">Copies the file and one line per block, to point the agent at them in a prompt.</p>
    </>
  );
}

function UnexploredPanel({ node, doc, filePath }: Props & { node: ViewNode }) {
  const [copied, setCopied] = useState(false);
  const source = node.ref ? findNode(doc, node.ref.scope, node.ref.id) : undefined;
  const id = node.ref?.id ?? node.id;
  const request = `Explain "${node.label}" (${id}) in ${filePath}`;
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <div className="lb-kind">Unexplored group</div>
      <h3>{node.label}</h3>
      {source?.desc && <p className="lb-desc">{source.desc}</p>}
      <p className="lb-muted">This part hasn't been explored yet. Ask the agent to explain it and this level will fill in here.</p>
      <PortList title="Inputs" ports={source?.inputs} doc={doc} />
      <PortList title="Outputs" ports={source?.outputs} doc={doc} />
      <section>
        <h4>Request for the agent</h4>
        <code className="lb-request">{request}</code>
        <button className="lb-button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy for agent'}
        </button>
      </section>
    </>
  );
}

function RisksPanel({ doc, onRisk, activeRisk }: Props) {
  const risks = [...(doc.risks ?? [])].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));
  return (
    <>
      <div className="lb-kind">Risks</div>
      <h3>{risks.filter((r) => r.status === 'open').length} open</h3>
      {risks.length === 0 && <p className="lb-muted">No risks noted.</p>}
      {risks.map((r) => (
        <button
          key={r.id}
          className={`lb-risk lb-risk-${r.severity} lb-risk-${r.status}${activeRisk === r.id ? ' lb-risk-active' : ''}`}
          onClick={() => onRisk(r)}
        >
          <b>{r.title}</b>
          <span className="lb-muted">
            {r.severity} · {r.status}
          </span>
          {r.detail && <span>{r.detail}</span>}
          {r.resolution && <span className="lb-resolution">Resolution: {r.resolution}</span>}
        </button>
      ))}
    </>
  );
}
