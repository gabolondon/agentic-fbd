import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import {
  buildView,
  initialPath,
  LAYOUT_VERSION,
  levelKey,
  layoutFileName,
  type Risk,
  type ViewModel,
  type ViewNode,
  type ViewPath,
} from '@logic-builder/core';
import { layoutReadable, type Box, type Layout } from './layout/elk.ts';
import { applySaved, fitFrames, snapToWires, snapshot } from './layout/arrange.ts';
import { nodeSize } from './layout/sizes.ts';
import { readHash, writeHash, type Location } from './state/hash.ts';
import { locateNode, riskTarget, type TreeItem } from './state/lookup.ts';
import { NavPanel } from './components/NavPanel.tsx';
import { useDocument, type DocHandle } from './state/useDocument.ts';
import { flowType, nodeTypes, type LogicFlowNode } from './components/nodes.tsx';
import { edgeTypes, type LogicFlowEdge } from './components/TypedEdge.tsx';
import { SidePanel, type Panel } from './components/SidePanel.tsx';
import { EdgeTooltip, type TooltipState } from './components/Tooltip.tsx';

export function App() {
  const [loc, setLoc] = useState<Location>(() => readHash());
  const state = useDocument(loc.file);
  return (
    <ReactFlowProvider>
      <Viewer state={state} loc={loc} setLoc={setLoc} />
    </ReactFlowProvider>
  );
}

interface Flow {
  key: string;
  /** The level's key in the layout file. */
  level: string;
  view: ViewModel | null;
  /** Changes on every new layout, not while blocks are dragged. */
  stamp: number;
  nodes: LogicFlowNode[];
  edges: LogicFlowEdge[];
}

const EMPTY_FLOW: Flow = { key: '', level: '', view: null, stamp: 0, nodes: [], edges: [] };

interface ViewerProps {
  state: DocHandle;
  loc: Location;
  setLoc: React.Dispatch<React.SetStateAction<Location>>;
}

function Viewer({ state, loc, setLoc }: ViewerProps) {
  const { doc } = state;
  const [panel, setPanel] = useState<Panel>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [activeRisk, setActiveRisk] = useState<string | null>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [flow, setFlow] = useState<Flow>(EMPTY_FLOW);
  // Tree clicks and links: open a level, then select a node once that level is laid out.
  const [pendingSelect, setPendingSelect] = useState<{ scope: string; id: string } | null>(null);
  /** The diagram the view was set up for; null until the first one loads. */
  const startedFor = useRef<string | null>(null);
  /** Block to show once a linked diagram has loaded. */
  const pendingLink = useRef<string | null>(null);
  const lastFit = useRef<string | null>(null);
  // Read by the layout effect, which reruns on a new view or a reset, not on every save.
  const layoutRef = useRef(state.layout);
  layoutRef.current = state.layout;
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const stamp = useRef(0);
  const [arranged, setArranged] = useState(0);
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // When a diagram loads: go to a linked block, or open on subject.focus unless the URL (on the
  // very first load) already says where to go.
  useEffect(() => {
    if (!doc || startedFor.current === state.file) return;
    const first = startedFor.current === null;
    startedFor.current = state.file;
    const target = pendingLink.current;
    pendingLink.current = null;
    const item = target ? locateNode(doc, target) : undefined;
    if (item) {
      setPendingSelect(item.select ?? null);
      setLoc((l) => ({ ...l, path: item.path, explicit: true }));
    } else if (!first || !loc.explicit) {
      setLoc((l) => ({ ...l, path: initialPath(doc), mode: 'after', explicit: true }));
    }
  }, [doc, state.file, loc.explicit, setLoc]);

  const openedFile = state.files.find((f) => f.opened)?.file;
  /** Follows a `see` link: "file.logic.json" or "file.logic.json#node". */
  const openLink = useCallback(
    (see: string) => {
      const [name = '', node] = see.split('#');
      setPanel(null);
      setHighlight(new Set());
      setActiveRisk(null);
      setTip(null);
      if (name === state.file) {
        const item = node && doc ? locateNode(doc, node) : undefined;
        if (item) {
          setPendingSelect(item.select ?? null);
          setLoc((l) => ({ ...l, path: item.path, explicit: true }));
        }
        return;
      }
      pendingLink.current = node ?? null;
      setLoc({ path: [], mode: 'after', file: name === openedFile ? undefined : name, explicit: true });
    },
    [state.file, doc, openedFile, setLoc],
  );

  const design = doc?.subject.mode === 'design';
  const mode = design ? loc.mode : 'after';
  const showChanges = design && mode === 'after';

  const view = useMemo<ViewModel | null>(
    () => (doc ? buildView(doc, loc.path, mode) : null),
    [doc, loc.path, mode],
  );

  // After a reload the level may be gone: follow the trimmed path.
  useEffect(() => {
    if (view && view.path.join('/') !== loc.path.join('/')) setLoc((l) => ({ ...l, path: view.path }));
  }, [view, loc.path, setLoc]);

  useEffect(() => {
    if (startedFor.current !== null) writeHash(loc.path, loc.mode, loc.file);
  }, [loc]);

  useEffect(() => {
    if (!view || !doc) return;
    let cancelled = false;
    const file = state.file;
    void layoutReadable(view, (labelEdges) => buildView(doc, view.path, view.mode, { labelEdges })).then((laid) => {
      if (cancelled) return;
      const saved = layoutRef.current?.levels[levelKey(laid.view.path)];
      setFlow(toFlow(laid.view, applySaved(laid.view, laid.layout, saved), file, ++stamp.current));
    });
    return () => {
      cancelled = true;
    };
  }, [view, arranged]);

  // Re-measure handles after every layout; fit only when the level changes.
  useEffect(() => {
    const f = flowRef.current;
    if (!f.key) return;
    for (const n of f.nodes) updateNodeInternals(n.id);
    if (lastFit.current !== f.key) {
      lastFit.current = f.key;
      // Never fit so far out that labels are unreadable; pan to see the rest.
      requestAnimationFrame(() => void fitView({ padding: 0.12, duration: 180, maxZoom: 1.1, minZoom: 0.55 }));
    }
  }, [flow.stamp, fitView, updateNodeInternals]);

  // Dragging: blocks snap level with a wire's other end, and frames grow to keep their children.
  const onNodesChange = useCallback((changes: NodeChange<LogicFlowNode>[]) => {
    const moves = changes.flatMap((c) => (c.type === 'position' && c.position ? [{ id: c.id, ...c.position }] : []));
    if (!moves.length) return;
    setFlow((f) => {
      if (!f.view) return f;
      const viewNodes = new Map(f.view.nodes.map((n) => [n.id, n]));
      const boxes = boxesOf(f.nodes);
      for (const m of moves) {
        const box = boxes.get(m.id);
        if (!box) continue;
        // Whole pixels, as they are saved.
        box.x = Math.round(m.x);
        box.y = Math.round(moves.length === 1 ? snapToWires(viewNodes, boxes, f.view.edges, m.id, m.y) : m.y);
      }
      return { ...f, nodes: withBoxes(f.nodes, fitFrames(f.view.nodes, boxes, false)) };
    });
  }, []);

  // Dropping: frames hug their children again, and the level's positions are saved.
  const { saveLayout } = state;
  const onNodeDragStop = useCallback(() => {
    const f = flowRef.current;
    if (!f.view) return;
    const boxes = fitFrames(f.view.nodes, boxesOf(f.nodes), true);
    setFlow({ ...f, nodes: withBoxes(f.nodes, boxes) });
    const levels = { ...(layoutRef.current?.levels ?? {}) };
    levels[f.level] = { ...levels[f.level], ...snapshot(boxes, f.nodes.map((n) => n.id)) };
    saveLayout({ version: LAYOUT_VERSION, levels });
  }, [saveLayout]);

  const level = view ? levelKey(view.path) : '';
  const arrangedByHand = !!state.layout?.levels[level];
  const resetLayout = useCallback(() => {
    const levels = { ...(layoutRef.current?.levels ?? {}) };
    delete levels[level];
    saveLayout({ version: LAYOUT_VERSION, levels });
    setArranged((n) => n + 1);
  }, [level, saveLayout]);

  const navigate = useCallback((path: ViewPath) => {
    setTip(null);
    setLoc((l) => ({ ...l, path, explicit: true }));
  }, []);

  const goUp = useCallback(() => {
    if (!view || view.breadcrumb.length < 2) return;
    navigate(view.breadcrumb[view.breadcrumb.length - 2]!.path);
  }, [view, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (panel && panel.type !== 'risks') setPanel(null);
      else goUp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, goUp]);

  const enter = useCallback(
    (node: ViewNode) => {
      if (!view) return;
      if (node.unexplored) {
        setPanel({ type: 'unexplored', node });
        return;
      }
      if (!node.enterable && node.see) {
        openLink(node.see);
        return;
      }
      if (!node.enterable || !node.ref) return;
      // The last path element is a group root (same scope) or an instance (whose body we are in).
      const base = view.rootGroup !== undefined ? view.path.slice(0, -1) : view.path;
      setPanel(null);
      setHighlight(new Set());
      navigate([...base, node.ref.id]);
    },
    [view, navigate, openLink],
  );

  const onNodeClick: NodeMouseHandler<LogicFlowNode> = useCallback(
    (_e, n) => {
      const v = n.data.view;
      if (v.connector) {
        // A flag points at the other end of its wire: show it.
        setPanel(null);
        setActiveRisk(null);
        setHighlight(new Set(v.connector.peers));
        void fitView({ nodes: [{ id: v.id }, ...v.connector.peers.map((id) => ({ id }))], padding: 0.3, maxZoom: 1.1, duration: 250 });
        return;
      }
      setPanel(v.unexplored ? { type: 'unexplored', node: v } : { type: 'node', node: v });
    },
    [fitView],
  );

  const onNodeDoubleClick: NodeMouseHandler<LogicFlowNode> = useCallback((_e, n) => enter(n.data.view), [enter]);

  const onEdgeEnter: EdgeMouseHandler<LogicFlowEdge> = useCallback((e, edge) => {
    if (edge.data) setTip({ edge: edge.data.view, x: e.clientX, y: e.clientY });
  }, []);
  const onEdgeMove: EdgeMouseHandler<LogicFlowEdge> = useCallback((e, edge) => {
    if (edge.data) setTip({ edge: edge.data.view, x: e.clientX, y: e.clientY });
  }, []);
  const onEdgeLeave = useCallback(() => setTip(null), []);

  const onRisk = useCallback(
    (risk: Risk) => {
      if (!doc) return;
      const target = riskTarget(doc, risk);
      setActiveRisk(risk.id);
      setHighlight(target.highlight);
      navigate(target.path);
    },
    [doc, navigate],
  );

  const onPaneClick = useCallback(() => {
    if (panel?.type !== 'risks') {
      setPanel(null);
      setHighlight(new Set());
      setActiveRisk(null);
    }
  }, [panel]);

  const [navOpen, setNavOpen] = useState(true);

  const onTreeOpen = useCallback(
    (item: TreeItem) => {
      setHighlight(new Set());
      setActiveRisk(null);
      if (item.isLevel) setPanel(null);
      setPendingSelect(item.select ?? null);
      navigate(item.path);
    },
    [navigate],
  );

  useEffect(() => {
    if (!pendingSelect || !view || flow.key !== flowKey(state.file, view)) return;
    const match = flow.nodes.find((n) => n.data.view.ref?.scope === pendingSelect.scope && n.data.view.ref.id === pendingSelect.id);
    if (match) {
      const v = match.data.view;
      setPanel(v.unexplored ? { type: 'unexplored', node: v } : { type: 'node', node: v });
      // Bring the chosen block into view once the canvas has resized for the panel.
      setTimeout(() => void fitView({ nodes: [{ id: match.id }], padding: 0.6, maxZoom: 1.2, duration: 250 }), 260);
    }
    setPendingSelect(null);
  }, [pendingSelect, flow, view, fitView, state.file]);

  const selectedId = panel && panel.type !== 'risks' ? panel.node.id : null;
  const selectedKey = panel && panel.type !== 'risks' && panel.node.ref ? `${panel.node.ref.scope}/${panel.node.ref.id}` : null;
  const hoveredEdge = tip ? tip.edge.id : null;

  const nodes = useMemo(
    () =>
      flow.nodes.map((n) => {
        const v = n.data.view;
        return {
          ...n,
          data: { ...n.data, showChanges, selected: v.id === selectedId, highlighted: highlight.has(v.ref?.id ?? v.id) },
        };
      }),
    [flow.nodes, showChanges, selectedId, highlight],
  );
  const edges = useMemo(
    () =>
      flow.edges.map((e) => ({
        ...e,
        data: {
          ...e.data!,
          showChanges,
          hovered: e.id === hoveredEdge,
          highlighted: e.data!.view.wireIds.some((w) => highlight.has(w)),
        },
      })),
    [flow.edges, showChanges, hoveredEdge, highlight],
  );

  const openRisks = (doc?.risks ?? []).filter((r) => r.status === 'open').length;
  const errors = state.issues.filter((i) => i.level === 'error');

  return (
    <div className={`lb-app${navOpen && doc ? ' lb-with-nav' : ''}`}>
      {doc && navOpen && (
        <NavPanel
          doc={doc}
          path={view?.path ?? []}
          selectedKey={selectedKey}
          showChanges={showChanges}
          onOpen={onTreeOpen}
          files={state.files}
          currentFile={state.file}
          onOpenFile={openLink}
        />
      )}
      <div className="lb-main">
      <header className="lb-bar">
        {doc && (
          <button className="lb-icon-button" onClick={() => setNavOpen((o) => !o)} aria-label={navOpen ? 'Hide structure' : 'Show structure'} title={navOpen ? 'Hide structure' : 'Show structure'}>
            ☰
          </button>
        )}
        <div className="lb-level">
          {view && view.breadcrumb.length > 1 ? (
            <>
              <button className="lb-up" onClick={goUp} title="Up one level (Esc)">
                ↑ {view.breadcrumb[view.breadcrumb.length - 2]!.label}
              </button>
              <strong>{view.breadcrumb[view.breadcrumb.length - 1]!.label}</strong>
            </>
          ) : (
            <strong>{doc ? 'Overview' : 'logic-builder'}</strong>
          )}
        </div>
        <div className="lb-spacer" />
        {!state.connected && state.loaded && <span className="lb-chip lb-chip-offline">offline</span>}
        {!state.layoutSaved && (
          <span className="lb-chip lb-chip-offline" title="The arrangement is kept until you reload">
            layout not saved
          </span>
        )}
        {doc && arrangedByHand && (
          <button
            className="lb-pill"
            onClick={resetLayout}
            title={`Lay this level out automatically again (drops its positions from ${layoutFileName(state.file)})`}
          >
            Auto layout
          </button>
        )}
        {design && (
          <div className="lb-segmented" role="group" aria-label="View">
            {(['before', 'after'] as const).map((m) => (
              <button key={m} className={mode === m ? 'lb-on' : ''} onClick={() => setLoc((l) => ({ ...l, mode: m }))}>
                {m === 'before' ? 'Before' : 'After'}
              </button>
            ))}
          </div>
        )}
        {(doc?.risks?.length ?? 0) > 0 && (
          <button className={`lb-pill${panel?.type === 'risks' ? ' lb-on' : ''}`} onClick={() => setPanel(panel?.type === 'risks' ? null : { type: 'risks' })}>
            Risks <b className={openRisks ? 'lb-count-open' : ''}>{openRisks}</b>
          </button>
        )}
      </header>

      {!state.valid && errors.length > 0 && (
        <div className="lb-banner" role="alert">
          <b>
            {errors.length} validation {errors.length === 1 ? 'error' : 'errors'} in {state.path || 'the file'}
            {doc ? ' — showing the last valid version' : ''}
          </b>
          <ul>
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
            {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
          </ul>
        </div>
      )}

      <div className="lb-stage">
        <div className="lb-canvas">
          {doc ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesConnectable={false}
              // A small wobble while clicking is still a click, not a drag.
              nodeDragThreshold={4}
              nodeClickDistance={4}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              elementsSelectable={false}
              zoomOnDoubleClick={false}
              minZoom={0.15}
              maxZoom={2.5}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              // An edge click handler also keeps React Flow from marking edges "inactive"
              // (pointer-events: none) when elements are not selectable.
              onEdgeClick={onEdgeEnter}
              onEdgeMouseEnter={onEdgeEnter}
              onEdgeMouseMove={onEdgeMove}
              onEdgeMouseLeave={onEdgeLeave}
              onPaneClick={onPaneClick}
            >
              <Background gap={18} size={1.2} color="#d5dae3" />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="lb-empty">{state.loaded ? 'No diagram to show yet.' : 'Loading…'}</div>
          )}
        </div>
        {doc && (
          <SidePanel
            panel={panel}
            doc={doc}
            filePath={state.path}
            mode={mode}
            showChanges={showChanges}
            onClose={() => {
              setPanel(null);
              setHighlight(new Set());
              setActiveRisk(null);
            }}
            onNavigate={navigate}
            onOpenLink={openLink}
            onRisk={onRisk}
            activeRisk={activeRisk}
          />
        )}
      </div>
      </div>
      {tip && doc && <EdgeTooltip tip={tip} doc={doc} />}
    </div>
  );
}

/** Identifies a level in a diagram: the viewport is fitted again when it changes. */
function flowKey(file: string, view: ViewModel): string {
  return `${file}|${view.path.join('/')}`;
}

function boxesOf(nodes: readonly LogicFlowNode[]): Map<string, Box> {
  return new Map(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, width: n.width ?? 0, height: n.height ?? 0 }]));
}

/** Writes positions and frame sizes back into the React Flow nodes. */
function withBoxes(nodes: readonly LogicFlowNode[], boxes: ReadonlyMap<string, Box>): LogicFlowNode[] {
  return nodes.map((n) => {
    const b = boxes.get(n.id);
    if (!b) return n;
    const moved = b.x !== n.position.x || b.y !== n.position.y;
    const resized = b.width !== n.width || b.height !== n.height;
    if (!moved && !resized) return n;
    return {
      ...n,
      position: moved ? { x: b.x, y: b.y } : n.position,
      ...(resized ? { width: b.width, height: b.height, style: { ...n.style, width: b.width, height: b.height } } : {}),
    };
  });
}

function toFlow(view: ViewModel, layout: Layout, file: string, stamp: number): Flow {
  const nodes: LogicFlowNode[] = view.nodes.map((v) => {
    const box = layout.boxes.get(v.id);
    const size = v.type === 'frame' ? { width: box?.width ?? 200, height: box?.height ?? 120 } : nodeSize(v);
    return {
      id: v.id,
      type: flowType(v),
      position: { x: box?.x ?? 0, y: box?.y ?? 0 },
      parentId: v.parentFrame,
      width: size.width,
      height: size.height,
      // A frame is dragged by its label; the rest of it lets clicks and pans through.
      style: { width: size.width, height: size.height, ...(v.type === 'frame' ? { pointerEvents: 'none' as const } : {}) },
      dragHandle: v.type === 'frame' ? '.lb-frame-label' : undefined,
      zIndex: v.type === 'frame' ? 0 : 2,
      selectable: false,
      data: { view: v, selected: false, highlighted: false, showChanges: false },
    };
  });
  const edges: LogicFlowEdge[] = view.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: `out:${e.sourceHandle}`,
    targetHandle: `in:${e.targetHandle}`,
    type: 'typed',
    zIndex: 1,
    data: { view: e, route: layout.routes.get(e.id), highlighted: false, hovered: false, showChanges: false },
  }));
  // Fit the viewport when the level changes, not on reloads or mode switches.
  return { key: flowKey(file, view), level: levelKey(view.path), view, stamp, nodes, edges };
}
