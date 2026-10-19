import { useState } from 'react';
import { describeType, type LogicDoc, type LogicGuide, type Ports, type Risk, type ViewMode, type ViewNode, type ViewPath } from '@logic-builder/core';
import { findNode, instancesOf, risksFor } from '../state/lookup.ts';
import { KIND_LABEL } from './nodes.tsx';

export type Panel =
  | { type: 'node'; node: ViewNode }
  | { type: 'unexplored'; node: ViewNode }
  | { type: 'risks' }
  | null;

interface Props {
  panel: Panel;
  doc: LogicDoc;
  filePath: string;
  mode: ViewMode;
  showChanges: boolean;
  onClose: () => void;
  onNavigate: (path: ViewPath) => void;
  onRisk: (risk: Risk) => void;
  activeRisk: string | null;
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
          {panel.type === 'node' && <NodePanel {...props} node={panel.node} />}
          {panel.type === 'unexplored' && <UnexploredPanel {...props} node={panel.node} />}
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

function Explanation({ desc, logic }: { desc?: string; logic?: LogicGuide }) {
  if (!desc && !logic) {
    return <p className="lb-muted lb-no-explanation">No explanation yet. Ask Claude to describe this block.</p>;
  }
  return (
    <div className="lb-explanation">
      {desc && (
        <section>
          <h4>What it does</h4>
          <p className="lb-desc">{desc}</p>
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

const CHANGE_TAG: Record<string, string> = { new: 'new', modified: 'modified', removed: 'removed', affected: 'affected' };

function NodePanel({ node, doc, showChanges, onNavigate }: Props & { node: ViewNode }) {
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
  const source = findNode(doc, node.ref.scope, node.ref.id);
  if (!source) return null;
  const type = source.kind === 'instance' && source.of ? doc.blockTypes?.[source.of] : undefined;
  const inputs = source.kind === 'instance' ? type?.inputs : source.inputs;
  const outputs = source.kind === 'instance' ? type?.outputs : source.outputs;
  const code = source.code ?? type?.code;
  const risks = risksFor(doc, node.ref.scope, node.ref.id);
  const uses = source.kind === 'instance' && source.of ? instancesOf(doc, source.of) : [];
  const mark = showChanges ? node.mark : undefined;
  const changeNote = showChanges ? (source.changeNote ?? (node.mark === 'affected' ? type?.changeNote : undefined)) : undefined;
  return (
    <>
      <div className="lb-kind">{KIND_LABEL[source.kind]}</div>
      <h3>
        {source.label}
        {mark && <span className={`lb-tag lb-tag-${mark}`}>{CHANGE_TAG[mark]}</span>}
      </h3>
      <Explanation desc={source.desc ?? type?.desc} logic={source.logic ?? type?.logic} />
      {source.kind === 'trigger' && (
        <section>
          <h4>Context</h4>
          <div>
            source: <code>{source.source}</code>
          </div>
          {Object.entries(source.context ?? {}).map(([k, val]) => (
            <div key={k}>
              {k}: <code>{Array.isArray(val) ? val.join(', ') : String(val)}</code>
            </div>
          ))}
        </section>
      )}
      {source.kind === 'state' && source.valueType !== undefined && (
        <section>
          <h4>Holds</h4>
          <span className="lb-type">{describeType(source.valueType, doc.types ?? {})}</span>
        </section>
      )}
      <PortList title="Inputs" ports={inputs} doc={doc} />
      <PortList title="Outputs" ports={outputs} doc={doc} />
      {(code || source.ref) && (
        <section>
          <h4>Code</h4>
          {code ? (
            <code>
              {code.file}
              {code.symbol ? ` › ${code.symbol}` : ''}
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
      {node.enterable && node.type !== 'frame' && !node.unexplored && <p className="lb-muted">Double-click to see inside.</p>}
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
      <p className="lb-muted">This part hasn't been explored yet. Ask Claude to explain it and this level will fill in here.</p>
      <PortList title="Inputs" ports={source?.inputs} doc={doc} />
      <PortList title="Outputs" ports={source?.outputs} doc={doc} />
      <section>
        <h4>Request for Claude</h4>
        <code className="lb-request">{request}</code>
        <button className="lb-button" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy request for Claude'}
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
