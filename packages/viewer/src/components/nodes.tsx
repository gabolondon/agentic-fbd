import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { NodeKind, ViewNode, ViewPort } from '@logic-builder/core';
import { portY } from '../layout/sizes.ts';

export interface NodeData extends Record<string, unknown> {
  view: ViewNode;
  selected: boolean;
  highlighted: boolean;
  /** Change colors are shown only in the After view of a design. */
  showChanges: boolean;
}

export type LogicFlowNode = Node<NodeData>;

export const KIND_ICON: Record<NodeKind, string> = {
  trigger: '⚡',
  function: 'ƒ',
  state: '▣',
  decision: '◇',
  external: '⇄',
  result: '●',
  group: '▤',
  instance: '◆',
  pin: '○',
};

export const KIND_LABEL: Record<NodeKind, string> = {
  trigger: 'Trigger',
  function: 'Function',
  state: 'State',
  decision: 'Decision',
  external: 'External',
  result: 'Result',
  group: 'Group',
  instance: 'Reusable block',
  pin: 'Block port',
};

function classes(data: NodeData, ...extra: string[]): string {
  const v = data.view;
  return [
    'lb-node',
    `lb-kind-${v.kind}`,
    data.showChanges && v.mark ? `lb-mark-${v.mark}` : '',
    v.ghost ? 'lb-ghost' : '',
    data.selected ? 'lb-selected' : '',
    data.highlighted ? 'lb-highlighted' : '',
    ...extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function Ports({ view, side }: { view: ViewNode; side: 'in' | 'out' }) {
  const ports: ViewPort[] = side === 'in' ? view.inputs : view.outputs;
  return (
    <>
      {ports.map((p, i) => (
        <div key={p.id}>
          <Handle
            type={side === 'in' ? 'target' : 'source'}
            id={`${side}:${p.id}`}
            position={side === 'in' ? Position.Left : Position.Right}
            style={{ top: portY(view, i) }}
            className={p.ghost ? 'lb-handle lb-handle-ghost' : 'lb-handle'}
            isConnectable={false}
          />
          {p.label && (
            <span className={`lb-port-label lb-port-${side}${p.ghost ? ' lb-port-ghost' : ''}`} style={{ top: portY(view, i) }}>
              {p.label}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function Badges({ data }: { data: NodeData }) {
  const v = data.view;
  const risk = v.openRisk || v.innerRisk;
  const inner = data.showChanges && v.innerChanges && !v.mark;
  return (
    <>
      {risk && <span className="lb-dot lb-dot-risk" title={v.openRisk ? 'Open risk' : 'Open risk inside'} />}
      {inner && <span className="lb-dot lb-dot-inner" title="Changes inside" />}
    </>
  );
}

export const BlockNode = memo(function BlockNode({ data }: NodeProps<LogicFlowNode>) {
  const v = data.view;
  return (
    <div className={classes(data, 'lb-block')}>
      <div className="lb-accent" />
      <div className="lb-header">
        <span className="lb-icon">{KIND_ICON[v.kind]}</span>
        <span className="lb-label">{v.label}</span>
      </div>
      <Badges data={data} />
      <Ports view={v} side="in" />
      <Ports view={v} side="out" />
      {v.enterable && v.kind === 'instance' && <span className="lb-hint">double-click ⤢</span>}
    </div>
  );
});

export const StateNode = memo(function StateNode({ data }: NodeProps<LogicFlowNode>) {
  const v = data.view;
  return (
    <div className={classes(data, 'lb-state')}>
      <div className="lb-accent" />
      <div className="lb-state-label">
        <span className="lb-icon">{KIND_ICON.state}</span>
        <span className="lb-label">{v.label}</span>
      </div>
      <Badges data={data} />
      <Ports view={v} side="in" />
      <Ports view={v} side="out" />
    </div>
  );
});

export const BoxNode = memo(function BoxNode({ data }: NodeProps<LogicFlowNode>) {
  const v = data.view;
  return (
    <div className={classes(data, 'lb-box', v.unexplored ? 'lb-unexplored' : '')}>
      <div className="lb-accent" />
      <div className="lb-header">
        <span className="lb-icon">{KIND_ICON.group}</span>
        <span className="lb-label">{v.label}</span>
      </div>
      <Badges data={data} />
      <Ports view={v} side="in" />
      <Ports view={v} side="out" />
      <span className="lb-hint">{v.unexplored ? 'unexplored' : 'double-click ⤢'}</span>
    </div>
  );
});

export const FrameNode = memo(function FrameNode({ data }: NodeProps<LogicFlowNode>) {
  const v = data.view;
  return (
    <div className={classes(data, 'lb-frame')}>
      <span className="lb-frame-label">{v.label}</span>
      <Badges data={data} />
    </div>
  );
});

export const PinNode = memo(function PinNode({ data }: NodeProps<LogicFlowNode>) {
  const v = data.view;
  return (
    <div className={classes(data, 'lb-pin', `lb-pin-${v.pinSide ?? 'left'}`)} title={v.outsideRef}>
      <span className="lb-pin-label">{v.label}</span>
      <Ports view={{ ...v, inputs: v.inputs.map((p) => ({ ...p, label: '' })), outputs: v.outputs.map((p) => ({ ...p, label: '' })) }} side="in" />
      <Ports view={{ ...v, inputs: v.inputs.map((p) => ({ ...p, label: '' })), outputs: v.outputs.map((p) => ({ ...p, label: '' })) }} side="out" />
    </div>
  );
});

export const nodeTypes = {
  block: BlockNode,
  state: StateNode,
  box: BoxNode,
  frame: FrameNode,
  pin: PinNode,
};

export function flowType(v: ViewNode): keyof typeof nodeTypes {
  if (v.type === 'block' && v.kind === 'state') return 'state';
  return v.type;
}
