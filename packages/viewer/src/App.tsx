import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from '@xyflow/react';
import { buildView, initialPath, type Risk, type ViewModel, type ViewNode, type ViewPath } from '@logic-builder/core';
import { layoutView, type Layout } from './layout/elk.ts';
import { nodeSize } from './layout/sizes.ts';
import { readHash, writeHash, type Location } from './state/hash.ts';
import { riskTarget, type TreeItem } from './state/lookup.ts';
import { NavPanel } from './components/NavPanel.tsx';
import { useDocument, type DocState } from './state/useDocument.ts';
import { flowType, nodeTypes, type LogicFlowNode } from './components/nodes.tsx';
import { edgeTypes, type LogicFlowEdge } from './components/TypedEdge.tsx';
import { SidePanel, type Panel } from './components/SidePanel.tsx';
import { EdgeTooltip, type TooltipState } from './components/Tooltip.tsx';

export function App() {
  const state = useDocument();
  return (
    <ReactFlowProvider>
      <Viewer state={state} />
    </ReactFlowProvider>
  );
}

interface Flow {
  key: string;
  nodes: LogicFlowNode[];
  edges: LogicFlowEdge[];
}

const EMPTY_FLOW: Flow = { key: '', nodes: [], edges: [] };

function Viewer({ state }: { state: DocState }) {
  const { doc } = state;
  const [loc, setLoc] = useState<Location>(() => readHash());
  const [panel, setPanel] = useState<Panel>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [activeRisk, setActiveRisk] = useState<string | null>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [flow, setFlow] = useState<Flow>(EMPTY_FLOW);
  const started = useRef(false);
  const lastFit = useRef<string | null>(null);
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  // Open on subject.focus the first time, unless the URL already says where to go.
  useEffect(() => {
    if (!doc || started.current) return;
    started.current = true;
    if (!loc.explicit) setLoc({ path: initialPath(doc), mode: 'after', explicit: true });
  }, [doc, loc.explicit]);

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
  }, [view, loc.path]);

  useEffect(() => {
    if (started.current) writeHash(loc.path, loc.mode);
  }, [loc]);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    void layoutView(view).then((layout) => {
      if (!cancelled) setFlow(toFlow(view, layout));
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Re-measure handles after every layout; fit only when the level changes.
  useEffect(() => {
    if (!flow.key) return;
    for (const n of flow.nodes) updateNodeInternals(n.id);
    if (lastFit.current !== flow.key) {
      lastFit.current = flow.key;
      requestAnimationFrame(() => void fitView({ padding: 0.12, duration: 180, maxZoom: 1.1 }));
    }
  }, [flow, fitView, updateNodeInternals]);

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
      if (!node.enterable || !node.ref) return;
      // The last path element is a group root (same scope) or an instance (whose body we are in).
      const base = view.rootGroup !== undefined ? view.path.slice(0, -1) : view.path;
      setPanel(null);
      setHighlight(new Set());
      navigate([...base, node.ref.id]);
    },
    [view, navigate],
  );

  const onNodeClick: NodeMouseHandler<LogicFlowNode> = useCallback((_e, n) => {
    const v = n.data.view;
    setPanel(v.unexplored ? { type: 'unexplored', node: v } : { type: 'node', node: v });
  }, []);

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

  // Tree clicks: open the item's level, then select the node once that level is laid out.
  const [pendingSelect, setPendingSelect] = useState<{ scope: string; id: string } | null>(null);
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
    if (!pendingSelect || !view || flow.key !== (view.path.join('/') || '/')) return;
    const match = flow.nodes.find((n) => n.data.view.ref?.scope === pendingSelect.scope && n.data.view.ref.id === pendingSelect.id);
    if (match) {
      const v = match.data.view;
      setPanel(v.unexplored ? { type: 'unexplored', node: v } : { type: 'node', node: v });
      // Bring the chosen block into view once the canvas has resized for the panel.
      setTimeout(() => void fitView({ nodes: [{ id: match.id }], padding: 0.6, maxZoom: 1.2, duration: 250 }), 260);
    }
    setPendingSelect(null);
  }, [pendingSelect, flow, view, fitView]);

  const selectedId = panel && panel.type !== 'risks' ? panel.node.id : null;
  const selectedKey = panel && panel.type !== 'risks' && panel.node.ref ? `${panel.node.ref.scope}/${panel.node.ref.id}` : null;
  const hoveredEdge = tip ? `e:${tip.edge.wireIds[0]}` : null;

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
        <NavPanel doc={doc} path={view?.path ?? []} selectedKey={selectedKey} showChanges={showChanges} onOpen={onTreeOpen} />
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
              nodesDraggable={false}
              nodesConnectable={false}
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

function toFlow(view: ViewModel, layout: Layout): Flow {
  const nodes: LogicFlowNode[] = view.nodes.map((v) => {
    const box = layout.get(v.id);
    const size = v.type === 'frame' ? { width: box?.width ?? 200, height: box?.height ?? 120 } : nodeSize(v);
    return {
      id: v.id,
      type: flowType(v),
      position: { x: box?.x ?? 0, y: box?.y ?? 0 },
      parentId: v.parentFrame,
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      zIndex: v.type === 'frame' ? 0 : 2,
      draggable: false,
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
    data: { view: e, highlighted: false, hovered: false, showChanges: false },
  }));
  // Fit the viewport when the level changes, not on reloads or mode switches.
  return { key: view.path.join('/') || '/', nodes, edges };
}
