import { memo } from 'react';
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { ViewEdge } from '@logic-builder/core';

export interface EdgeData extends Record<string, unknown> {
  view: ViewEdge;
  highlighted: boolean;
  hovered: boolean;
  showChanges: boolean;
}

export type LogicFlowEdge = Edge<EdgeData>;

/** CSS class that decides the wire's color, most important first. */
export function edgeTone(data: EdgeData): string {
  const v = data.view;
  if (v.ghost) return 'lb-edge-ghost';
  if (data.highlighted) return 'lb-edge-highlight';
  if (v.compat === 'error') return 'lb-edge-error';
  if (v.compat === 'warning') return 'lb-edge-warning';
  if (data.showChanges && v.mark === 'new') return 'lb-edge-new';
  if (data.showChanges && v.mark === 'modified') return 'lb-edge-modified';
  return 'lb-edge-plain';
}

export const TypedEdge = memo(function TypedEdge(props: EdgeProps<LogicFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const tone = edgeTone(data);
  return (
    <>
      <BaseEdge path={path} className={`lb-edge ${tone}${data.hovered ? ' lb-edge-hovered' : ''}`} interactionWidth={16} />
      {data.view.compat === 'warning' && !data.view.ghost && (
        <g transform={`translate(${labelX}, ${labelY})`} className="lb-edge-flag">
          <circle r={7} />
          <text textAnchor="middle" dy={3.5}>
            !
          </text>
        </g>
      )}
    </>
  );
});

export const edgeTypes = { typed: TypedEdge };
