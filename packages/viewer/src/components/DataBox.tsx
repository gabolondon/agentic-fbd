import { useMemo, useState, type ReactNode } from 'react';
import { dataBox, parseType, typeToString, type DataField, type DataItem, type DataUse, type LogicDoc, type ViewMode } from '@logic-builder/core';

// The Data section of the side panel (design spec §6.8): what a block reads and writes and where
// that data lives. Everything starts collapsed and nothing is remembered between clicks; the
// panel mounts it with a key per selected block.

interface Props {
  doc: LogicDoc;
  scope: string;
  id: string;
  mode: ViewMode;
  /** Opens the level that shows a block and selects it. */
  onSelect: (scope: string, id: string) => void;
}

export function DataBox({ doc, scope, id, mode, onSelect }: Props) {
  const box = useMemo(() => dataBox(doc, scope, id, mode), [doc, scope, id, mode]);
  const [open, setOpen] = useState(false);
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
        <Items title="Reads" items={box.reads} />
        <Items title="Writes" items={box.writes} />
        <Items title="Responses" items={box.responses} />
      </>
    );
  }

  return (
    <section className={`lb-data${open ? ' lb-data-open' : ''}`}>
      <button className="lb-data-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="lb-caret">{open ? '▾' : '▸'}</span>
        <b>Data</b>
        <span className="lb-muted"> · {summary}</span>
      </button>
      {open && <div className="lb-data-body">{body}</div>}
    </section>
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

function Items({ title, items }: { title: string; items: DataItem[] }) {
  return (
    <Section title={title} count={items.length}>
      {items.map((item) => (
        <DataRow key={item.name} item={item} />
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

function DataRow({ item }: { item: DataItem }) {
  const [open, setOpen] = useState(false);
  const opens = !!(item.fields?.length || item.code || item.desc);
  const head = (
    <>
      {opens && <span className="lb-caret">{open ? '▾' : '▸'}</span>}
      <code className="lb-data-name">{item.name}</code>
      <span className="lb-data-type">{typeLabel(item)}</span>
      {item.where && <span className="lb-where">{item.where}</span>}
    </>
  );
  return (
    <div className={`lb-data-row${open ? ' lb-data-row-open' : ''}`}>
      {opens ? (
        <button className="lb-data-row-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {head}
        </button>
      ) : (
        <div className="lb-data-row-head">{head}</div>
      )}
      {item.desc && <p className="lb-data-desc">{item.desc}</p>}
      {open && item.fields && item.fields.length > 0 && (
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
