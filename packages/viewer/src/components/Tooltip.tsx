import { describeType, type LogicDoc, type ViewEdge } from '@logic-builder/core';

export interface TooltipState {
  edge: ViewEdge;
  x: number;
  y: number;
}

const COMPAT_TEXT: Record<string, string> = {
  warning: 'Fits by shape, but the types differ in meaning.',
  error: 'Incompatible types.',
};

export function EdgeTooltip({ tip, doc }: { tip: TooltipState; doc: LogicDoc }) {
  const { edge } = tip;
  const types = doc.types ?? {};
  const shape = edge.type === undefined ? 'type unknown' : describeType(edge.type, types);
  const name = edge.type === undefined ? '' : typeof edge.type === 'string' ? edge.type : '';
  return (
    <div className="lb-tooltip" style={{ left: tip.x + 14, top: tip.y + 12 }} role="tooltip">
      {name && <div className="lb-tooltip-title">{name}</div>}
      <code>{shape}</code>
      {edge.op && <div className="lb-tooltip-muted">{edge.op === 'write' ? 'writes' : 'reads'} state</div>}
      {edge.ghost && <div className="lb-tooltip-removed">Removed by this change</div>}
      {COMPAT_TEXT[edge.compat] && <div className={`lb-tooltip-compat lb-compat-${edge.compat}`}>{COMPAT_TEXT[edge.compat]}</div>}
      <div className="lb-tooltip-muted">
        {edge.from} → {edge.to}
        {edge.wireIds.length > 1 ? ` (+${edge.wireIds.length - 1} more)` : ''}
      </div>
    </div>
  );
}
