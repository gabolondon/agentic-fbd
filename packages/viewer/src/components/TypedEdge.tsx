import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { ViewEdge } from '@logic-builder/core';
import type { Point } from '../layout/elk.ts';

export interface EdgeData extends Record<string, unknown> {
  view: ViewEdge;
  /** ELK's orthogonal route: start, bend points, end. Undefined before layout. */
  route?: Point[];
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
  if (data.showChanges && (v.mark === 'modified' || v.mark === 'affected')) return 'lb-edge-modified';
  return 'lb-edge-plain';
}

const CORNER = 8;
/** Bends this close to a handle's height are snapped to it, so routes leave ports level. */
const SNAP = 4;
/** Handles sit a few pixels outside the box ELK routed from. */
const SLACK_X = 8;

/** An orthogonal path through the bend points, with rounded corners. */
export function orthogonalPath(points: Point[]): { path: string; mid: Point } {
  const d: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(CORNER, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = toward(cur, prev, r);
    const b = toward(cur, next, r);
    d.push(`L ${a.x} ${a.y}`, `Q ${cur.x} ${cur.y} ${b.x} ${b.y}`);
  }
  const last = points[points.length - 1]!;
  d.push(`L ${last.x} ${last.y}`);
  return { path: d.join(' '), mid: midpoint(points) };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function toward(from: Point, to: Point, r: number): Point {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * r, y: from.y + ((to.y - from.y) / len) * r };
}

/** The point halfway along the polyline. */
function midpoint(points: Point[]): Point {
  const total = points.slice(1).reduce((sum, p, i) => sum + dist(points[i]!, p), 0);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1]!, points[i]!);
    if (seg >= left) return toward(points[i - 1]!, points[i]!, left);
    left -= seg;
  }
  return points[points.length - 1]!;
}

/** ELK's route still fits only if neither end has moved since layout (a block was dragged). */
function routeFits(route: Point[] | undefined, source: Point, target: Point): route is Point[] {
  if (!route || route.length < 2) return false;
  const start = route[0]!;
  const end = route[route.length - 1]!;
  return (
    Math.abs(start.x - source.x) <= SLACK_X &&
    Math.abs(start.y - source.y) <= SNAP &&
    Math.abs(end.x - target.x) <= SLACK_X &&
    Math.abs(end.y - target.y) <= SNAP
  );
}

/** Joins the handles to ELK's bends, snapping the first and last bends level with the handles. */
function routePoints(source: Point, target: Point, bends: Point[]): Point[] {
  const inner = bends.map((p) => ({ ...p }));
  if (inner.length >= 2) {
    if (Math.abs(inner[0]!.y - source.y) <= SNAP) inner[0]!.y = source.y;
    const end = inner[inner.length - 1]!;
    if (Math.abs(end.y - target.y) <= SNAP) end.y = target.y;
  }
  return [source, ...inner, target];
}

export const TypedEdge = memo(function TypedEdge(props: EdgeProps<LogicFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  if (!data) return null;
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  let path: string;
  let mid: Point;
  if (routeFits(data.route, source, target)) {
    ({ path, mid } = orthogonalPath(routePoints(source, target, data.route.slice(1, -1))));
  } else {
    // Before layout, or after a block was moved by hand: a plain orthogonal step.
    const [step, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: CORNER });
    path = step;
    mid = { x: labelX, y: labelY };
  }
  const tone = edgeTone(data);
  return (
    <>
      <BaseEdge path={path} className={`lb-edge ${tone}${data.hovered ? ' lb-edge-hovered' : ''}`} interactionWidth={16} />
      {data.view.compat === 'warning' && !data.view.ghost && (
        <g transform={`translate(${mid.x}, ${mid.y})`} className="lb-edge-flag">
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
