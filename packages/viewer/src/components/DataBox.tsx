import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dataBox, parseType, typeToString, type DataField, type DataItem, type DataUse, type Edit, type LogicDoc, type Side, type TypeExpr, type ViewMode } from '@logic-builder/core';
import { EditableText, FieldTable, isPlainObject, typeText } from './Editable.tsx';

// The Data section of the side panel (design spec §6.8): what a block reads and writes and where
// that data lives. Everything starts collapsed and nothing is remembered between clicks; the
// panel mounts it with a key per selected block. In the After view, ports and the fields of
// their types can be edited here (§6.9).

interface Props {
  doc: LogicDoc;
  scope: string;
  id: string;
  mode: ViewMode;
  /** Opens the level that shows a block and selects it. */
  onSelect: (scope: string, id: string) => void;
  /** Applies an edit; undefined when the box is read-only. */
  edit?: (e: Edit) => string | null;
  /** Set on an instance: its ports belong to the blockType, used in `uses` places. */
  shared?: { typeName: string; uses: number };
}

interface Editing {
  doc: LogicDoc;
  at: { scope: string; id: string };
  edit: (e: Edit) => string | null;
  /** Port edits go through here: on an instance they wait for a confirm. */
  editPort: (e: Edit) => string | null;
}

const EditContext = createContext<Editing | null>(null);

export function DataBox({ doc, scope, id, mode, onSelect, edit, shared }: Props) {
  const box = useMemo(() => dataBox(doc, scope, id, mode), [doc, scope, id, mode]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ edit: Edit; error: string | null } | null>(null);
  const editing = useMemo<Editing | null>(
    () =>
      edit
        ? {
            doc,
            at: { scope, id },
            edit,
            editPort: (e) => {
              if (!shared) return edit(e);
              setPending({ edit: e, error: null });
              return null;
            },
          }
        : null,
    [doc, scope, id, edit, shared],
  );
  if (!box) return null;

  let summary: string;
  let body: ReactNode;
  if (box.kind === 'state') {
    summary = `Read by ${box.readBy.length} · Written by ${box.writtenBy.length}`;
    body = (
      <>
        <DataRow item={box.holds} />
        <Section title="Written by" count={box.writtenBy.length}>
          <Uses uses={box.writtenBy} onSelect={onSelect} />
        </Section>
        <Section title="Read by" count={box.readBy.length}>
          <Uses uses={box.readBy} onSelect={onSelect} />
        </Section>
      </>
    );
  } else if (box.kind === 'boundary') {
    summary = `Comes in ${box.reads.length} · Goes out ${box.writes.length}`;
    body = (
      <>
        <Items title="Comes in" items={box.reads} />
        <Items title="Goes out" items={box.writes} />
        <p className="lb-muted lb-data-more">+{box.inside} more inside · double-click to open</p>
      </>
    );
  } else {
    if (box.reads.length + box.writes.length + box.responses.length === 0) return null;
    summary = `Reads ${box.reads.length} · Writes ${box.writes.length}${box.responses.length ? ` · Responses ${box.responses.length}` : ''}`;
    body = (
      <>
        <Items title="Reads" items={box.reads} side="inputs" />
        <Items title="Writes" items={box.writes} side="outputs" />
        <Items title="Responses" items={box.responses} side="outputs" />
      </>
    );
  }

  const apply = (): void => {
    if (!pending || !edit) return;
    const refused = edit(pending.edit);
    setPending(refused ? { ...pending, error: refused } : null);
  };

  return (
    <EditContext.Provider value={editing}>
      <section className={`lb-data${open ? ' lb-data-open' : ''}`}>
        <button className="lb-data-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="lb-caret">{open ? '▾' : '▸'}</span>
          <b>Data</b>
          <span className="lb-muted"> · {summary}</span>
        </button>
        {pending && shared && (
          <div className="lb-confirm" role="alert">
            <span>
              Changes all {shared.uses} {shared.uses === 1 ? 'use' : 'uses'} of {shared.typeName}
            </span>
            <span className="lb-spacer" />
            <button className="lb-pill lb-pill-small" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className="lb-button lb-button-small" onClick={apply}>
              Apply
            </button>
            {pending.error && <span className="lb-edit-error">{pending.error}</span>}
          </div>
        )}
        {open && <div className="lb-data-body">{body}</div>}
      </section>
    </EditContext.Provider>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="lb-data-section">
      <button className="lb-data-section-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="lb-caret">{open ? '▾' : '▸'}</span>
        {title} <span className="lb-muted">{count}</span>
      </button>
      {open && children}
    </div>
  );
}

function Items({ title, items, side }: { title: string; items: DataItem[]; side?: Side }) {
  return (
    <Section title={title} count={items.length}>
      {items.map((item) => (
        <DataRow key={item.name} item={item} side={side} />
      ))}
    </Section>
  );
}

function Uses({ uses, onSelect }: { uses: DataUse[]; onSelect: Props['onSelect'] }) {
  return (
    <div className="lb-data-uses">
      {uses.map((u) => (
        <button key={u.id} className="lb-link" onClick={() => onSelect(u.scope, u.id)}>
          {u.label}
        </button>
      ))}
    </div>
  );
}

function typeLabel(item: DataItem): string {
  if (item.typeName) return item.typeName;
  return item.type === undefined ? '' : typeToString(parseType(item.type));
}

/** One port or state. `side` is set when the item is a port of the selected block. */
function DataRow({ item, side }: { item: DataItem; side?: Side }) {
  const editing = useContext(EditContext);
  const [open, setOpen] = useState(false);
  const port = editing && side ? { ...editing.at, side } : null;
  // The named type's definition, when it is a plain object whose fields can be edited.
  const named = item.typeName ? editing?.doc.types?.[item.typeName] : undefined;
  const fieldsOfNamed = editing && isPlainObject(named) ? named : null;
  const inlineFields = port && isPlainObject(item.type) ? item.type : null;
  const opens = !!(item.fields?.length || item.code || item.desc || fieldsOfNamed || inlineFields);

  const setPortType = (type: TypeExpr): string | null =>
    editing!.editPort({ op: 'setPortType', at: port!, side: port!.side, port: item.name, type });

  return (
    <div className={`lb-data-row${open ? ' lb-data-row-open' : ''}`}>
      <div className="lb-data-row-head" onClick={() => opens && setOpen((o) => !o)} style={opens ? undefined : { cursor: 'default' }}>
        {opens && (
          <button className="lb-caret lb-caret-button" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
            {open ? '▾' : '▸'}
          </button>
        )}
        <code className="lb-data-name">
          <EditableText
            value={item.name}
            mono
            label={`Rename ${item.name}`}
            onCommit={port ? (v) => editing!.editPort({ op: 'renamePort', at: port, side: port.side, from: item.name, to: v }) : undefined}
          />
        </code>
        <span className="lb-data-type">
          <EditableText
            value={item.type === undefined ? '' : typeText(item.type)}
            mono
            label={`Type of ${item.name}`}
            onCommit={port && item.type !== undefined && !inlineFields ? (v) => setPortType(v.trim()) : undefined}
          >
            {typeLabel(item)}
          </EditableText>
        </span>
        {item.where && <span className="lb-where">{item.where}</span>}
      </div>
      {item.desc && <p className="lb-data-desc">{item.desc}</p>}
      {open && fieldsOfNamed && (
        <FieldTable type={fieldsOfNamed} onCommit={(next) => editing!.edit({ op: 'setType', name: item.typeName!, type: next })} />
      )}
      {open && !fieldsOfNamed && inlineFields && <FieldTable type={inlineFields} onCommit={setPortType} />}
      {open && !fieldsOfNamed && !inlineFields && item.fields && item.fields.length > 0 && (
        <div className="lb-data-fields">
          {item.fields.map((f) => (
            <FieldRow key={f.name} field={f} depth={0} />
          ))}
        </div>
      )}
      {open && item.code && (
        <div className="lb-data-code">
          ↗ <code>{item.code.file}</code>
          {item.code.symbol ? ` › ${item.code.symbol}` : ''}
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, depth }: { field: DataField; depth: number }) {
  const [open, setOpen] = useState(false);
  const nested = !!field.fields?.length;
  return (
    <>
      <div className="lb-field" style={{ paddingLeft: 6 + depth * 14 }}>
        {nested ? (
          <button className="lb-field-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="lb-field-toggle" />
        )}
        <span className="lb-field-name">{field.name}</span>
        <span className="lb-data-type">{field.type}</span>
      </div>
      {open && field.fields!.map((f) => <FieldRow key={f.name} field={f} depth={depth + 1} />)}
    </>
  );
}
