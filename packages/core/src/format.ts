// TypeScript model of the logic-builder file format (design spec §5).

/** A type expression: a string ("number", "Answer[]", "Record<K, V>", "'option'")
 *  or an object (a struct, or a union written as { oneOf: [...] }). */
export type TypeExpr = string | { oneOf: TypeExpr[] } | { [field: string]: TypeExpr };

export type Ports = Record<string, TypeExpr>;

export type Change = 'existing' | 'new' | 'modified' | 'removed';

export type NodeKind =
  | 'trigger'
  | 'function'
  | 'state'
  | 'decision'
  | 'external'
  | 'result'
  | 'group'
  | 'instance'
  | 'pin';

export type TriggerSource = 'user' | 'schedule' | 'http' | 'agent' | 'system';

export interface CodeRef {
  file: string;
  symbol?: string;
}

export interface NodeBefore {
  label?: string;
  desc?: string;
  inputs?: Ports;
  outputs?: Ports;
  code?: CodeRef;
  parent?: string;
  valueType?: TypeExpr;
}

/** A short guide to how a block works: one paragraph, or ordered steps. */
export type LogicGuide = string | string[];

export interface LogicNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** What the block does, in one or two sentences. */
  desc?: string;
  /** How it works inside, as a basic guide for the reader. */
  logic?: LogicGuide;
  parent?: string;
  inputs?: Ports;
  outputs?: Ports;
  code?: CodeRef;
  ref?: string;
  change?: Change;
  changeNote?: string;
  before?: NodeBefore;
  /** trigger only */
  source?: TriggerSource;
  context?: Record<string, unknown>;
  /** state only */
  valueType?: TypeExpr;
  /** instance only */
  of?: string;
  /** group only; false marks an unexplored group */
  explored?: boolean;
}

export type WireOp = 'read' | 'write';

export interface WireBefore {
  from?: string;
  to?: string;
  op?: WireOp;
}

export interface Wire {
  id: string;
  from: string;
  to: string;
  change?: Change;
  op?: WireOp;
  before?: WireBefore;
}

export interface Body {
  nodes: LogicNode[];
  wires: Wire[];
}

export interface BlockTypeBefore {
  label?: string;
  desc?: string;
  inputs?: Ports;
  outputs?: Ports;
  code?: CodeRef;
}

export interface BlockType {
  label: string;
  desc?: string;
  logic?: LogicGuide;
  inputs: Ports;
  outputs: Ports;
  code?: CodeRef;
  change?: Change;
  changeNote?: string;
  before?: BlockTypeBefore;
  body?: Body;
}

export type Severity = 'high' | 'medium' | 'low';

export interface Risk {
  id: string;
  severity: Severity;
  status: 'open' | 'resolved';
  title: string;
  detail?: string;
  resolution?: string;
  refs: string[];
}

export type Mode = 'understand' | 'design';

export interface Subject {
  id: string;
  title: string;
  intent: string;
  scope?: string;
  mode: Mode;
  focus?: string;
}

export interface LogicDoc {
  version: string;
  subject: Subject;
  types?: Record<string, TypeExpr>;
  blockTypes?: Record<string, BlockType>;
  nodes: LogicNode[];
  wires: Wire[];
  risks?: Risk[];
}
