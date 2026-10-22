import { useEffect, useMemo, useState } from 'react';
import type { LogicDoc, ViewPath } from '@logic-builder/core';
import { buildTree, type TreeItem } from '../state/lookup.ts';
import type { DiagramFile } from '../state/useDocument.ts';
import { KIND_ICON, KIND_LABEL } from './nodes.tsx';

interface Props {
  doc: LogicDoc;
  path: ViewPath;
  selectedKey: string | null;
  showChanges: boolean;
  onOpen: (item: TreeItem) => void;
  /** The diagrams in the same folder, and the one on screen. */
  files: DiagramFile[];
  currentFile: string;
  onOpenFile: (file: string) => void;
}

const samePath = (a: ViewPath, b: ViewPath): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function NavPanel({ doc, path, selectedKey, showChanges, onOpen, files, currentFile, onOpenFile }: Props) {
  const tree = useMemo(() => buildTree(doc), [doc]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Keep the branch that leads to the current level open.
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const visit = (items: TreeItem[]): boolean => {
        let found = false;
        for (const item of items) {
          const inside = (item.isLevel && path.length >= item.path.length && samePath(item.path, path.slice(0, item.path.length))) || visit(item.children);
          if (inside) {
            next.delete(item.key);
            found = true;
          }
        }
        return found;
      };
      visit(tree);
      return next;
    });
  }, [tree, path]);

  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderItems = (items: TreeItem[], depth: number) =>
    items.map((item) => {
      const current = item.isLevel && samePath(item.path, path);
      const selected = !!item.select && selectedKey === `${item.select.scope}/${item.select.id}`;
      const open = !collapsed.has(item.key);
      return (
        <li key={item.key}>
          <div
            className={`lb-tree-row${item.isLevel ? ' lb-tree-level' : ''}${current ? ' lb-tree-current' : ''}${selected ? ' lb-tree-selected' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {item.children.length > 0 ? (
              <button className="lb-tree-toggle" onClick={() => toggle(item.key)} aria-label={open ? 'Collapse' : 'Expand'}>
                {open ? '▾' : '▸'}
              </button>
            ) : (
              <span className="lb-tree-toggle" />
            )}
            <button className="lb-tree-item" onClick={() => onOpen(item)} title={`${item.label} · ${KIND_LABEL[item.kind]}`}>
              <span className={`lb-tree-icon lb-k-${item.kind}`}>{KIND_ICON[item.kind]}</span>
              <span className={`lb-tree-label${item.unexplored ? ' lb-tree-unexplored' : ''}`}>{item.label}</span>
              {showChanges && item.mark && <span className={`lb-tree-dot lb-tree-mark-${item.mark}`} title={item.mark} />}
              {item.risk && <span className="lb-tree-dot lb-tree-risk" title="Open risk" />}
            </button>
          </div>
          {item.children.length > 0 && open && <ul>{renderItems(item.children, depth + 1)}</ul>}
        </li>
      );
    });

  const design = doc.subject.mode === 'design';
  return (
    <nav className="lb-nav" aria-label="Diagram structure">
      <div className="lb-nav-head">
        <span className={`lb-mode-chip lb-mode-${doc.subject.mode}`}>{design ? 'Design' : 'Understand'}</span>
        <h2>{doc.subject.title}</h2>
        <p>{doc.subject.intent}</p>
        {doc.subject.scope && <div className="lb-nav-scope">Scope · {doc.subject.scope}</div>}
      </div>
      {files.length > 1 && (
        <>
          <div className="lb-nav-section">Diagrams</div>
          <ul className="lb-files">
            {files.map((f) => (
              <li key={f.file}>
                <button
                  className={`lb-file${f.file === currentFile ? ' lb-file-current' : ''}`}
                  onClick={() => onOpenFile(f.file)}
                  title={`${f.title}\n${f.file}`}
                  aria-current={f.file === currentFile ? 'page' : undefined}
                >
                  <span className="lb-file-icon">{f.file === currentFile ? '◉' : '○'}</span>
                  <span className="lb-file-title">{f.title}</span>
                  {f.draft && <span className="lb-draft-dot" title="Unsaved edits" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="lb-nav-section">Structure</div>
      <ul className="lb-tree">
        <li>
          <div className={`lb-tree-row lb-tree-level${path.length === 0 ? ' lb-tree-current' : ''}`} style={{ paddingLeft: 8 }}>
            <span className="lb-tree-toggle" />
            <button className="lb-tree-item" onClick={() => onOpen({ key: '', label: '', kind: 'group', path: [], isLevel: true, children: [] })}>
              <span className="lb-tree-icon lb-k-group">⌂</span>
              <span className="lb-tree-label">Overview</span>
            </button>
          </div>
        </li>
        {renderItems(tree, 0)}
      </ul>
      <Legend design={design} />
    </nav>
  );
}

function Legend({ design }: { design: boolean }) {
  const kinds = ['trigger', 'function', 'state', 'decision', 'external', 'result', 'instance', 'group'] as const;
  return (
    <div className="lb-legend">
      <div className="lb-nav-section">Legend</div>
      <div className="lb-legend-grid">
        {kinds.map((k) => (
          <span key={k} className="lb-legend-item">
            <span className={`lb-tree-icon lb-k-${k}`}>{KIND_ICON[k]}</span>
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
      <div className="lb-legend-lines">
        {design && (
          <>
            <span><i className="lb-swatch lb-swatch-new" />new</span>
            <span><i className="lb-swatch lb-swatch-mod" />modified</span>
            <span><i className="lb-swatch lb-swatch-removed" />removed</span>
          </>
        )}
        <span><i className="lb-swatch lb-swatch-warn" />type meaning differs</span>
        <span><i className="lb-swatch lb-swatch-error" />type mismatch</span>
      </div>
      <p className="lb-legend-hint">
        Drag blocks to arrange them (a group by its label). Shift-drag a box or Shift-click to select several; ⌘/Ctrl+A selects all.
      </p>
    </div>
  );
}
