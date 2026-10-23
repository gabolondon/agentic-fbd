import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseType, typeToString, type TypeExpr } from '@agentic-fbd/core';

// Editing in the side panel (design spec §6.9): every editable field shows a pencil on hover;
// there is no separate edit mode. A commit returns why it was refused, or null.

export type Commit = (value: string) => string | null;

interface TextProps {
  value: string;
  onCommit?: Commit;
  /** Enter adds a line; Cmd/Ctrl+Enter commits. */
  multiline?: boolean;
  mono?: boolean;
  /** Shown instead of an empty value. */
  placeholder?: string;
  /** What is shown when not editing; defaults to the value. */
  children?: ReactNode;
  /** Accessible name of the input. */
  label?: string;
}

/** A value with a pencil; without `onCommit` it is plain text. */
export function EditableText({ value, onCommit, multiline, mono, placeholder, children, label }: TextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const shown = children ?? (value || <span className="lb-muted">{placeholder}</span>);
  if (!onCommit) return <>{shown}</>;

  if (!editing) {
    return (
      <span className={`lb-editable${mono ? ' lb-editable-mono' : ''}`}>
        {shown}
        <button
          className="lb-pencil"
          aria-label="Edit"
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(value);
            setError(null);
            setEditing(true);
          }}
        />
      </span>
    );
  }

  const commit = (): void => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    const refused = onCommit(draft);
    if (refused) setError(refused);
    else setEditing(false);
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') setEditing(false);
    else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };
  const common = {
    ref: input,
    value: draft,
    'aria-label': label ?? 'Edit',
    className: `lb-input${mono ? ' lb-input-mono' : ''}${error ? ' lb-input-error' : ''}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      setError(null);
    },
    onKeyDown,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return (
    <span className="lb-editing">
      {multiline ? <textarea {...common} rows={3} /> : <input {...common} />}
      <span className="lb-edit-actions">
        <button className="lb-pill lb-pill-small" onClick={commit}>
          {multiline ? 'Save ⌘↵' : 'OK'}
        </button>
        <button className="lb-pill lb-pill-small" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
      {error && (
        <span className="lb-edit-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/** A plain object type: `{ field: Type }`, not a union written as `{ oneOf: [...] }`. */
export function isPlainObject(type: TypeExpr | undefined): type is Record<string, TypeExpr> {
  return typeof type === 'object' && type !== null && !('oneOf' in type && Object.keys(type).length === 1);
}

/** A type as the user edits it: the compact string syntax. */
export function typeText(type: TypeExpr): string {
  return typeof type === 'string' ? type : typeToString(parseType(type));
}

interface FieldProps {
  type: Record<string, TypeExpr>;
  onCommit: (next: Record<string, TypeExpr>) => string | null;
}

/** The fields of a plain object type: rename, retype or remove each, and add new ones. */
export function FieldTable({ type, onCommit }: FieldProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('string');
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(type);

  const rename = (from: string, to: string): string | null => {
    const next = to.trim();
    if (!next) return 'A field name cannot be empty.';
    if (next !== from && next in type) return `There is already a field "${next}".`;
    return onCommit(Object.fromEntries(entries.map(([k, v]) => [k === from ? next : k, v])));
  };
  const add = (): void => {
    const field = name.trim();
    if (!field) return setError('A field name cannot be empty.');
    if (field in type) return setError(`There is already a field "${field}".`);
    const refused = onCommit({ ...type, [field]: fieldType.trim() });
    if (refused) return setError(refused);
    setAdding(false);
    setName('');
    setFieldType('string');
    setError(null);
  };

  return (
    <div className="lb-data-fields lb-field-table">
      {entries.map(([field, t]) => (
        <div key={field} className="lb-field">
          <span className="lb-field-name">
            <EditableText value={field} mono label={`Rename field ${field}`} onCommit={(v) => rename(field, v)} />
          </span>
          <span className="lb-data-type">
            {typeof t === 'string' ? (
              <EditableText value={t} mono label={`Type of field ${field}`} onCommit={(v) => onCommit({ ...type, [field]: v.trim() })} />
            ) : (
              typeText(t)
            )}
          </span>
          <button
            className="lb-field-remove"
            aria-label={`Remove field ${field}`}
            title="Remove field"
            onClick={() => {
              const rest = Object.fromEntries(entries.filter(([k]) => k !== field));
              setError(onCommit(rest));
            }}
          >
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div className="lb-field lb-field-new">
          <input className="lb-input lb-input-mono" aria-label="New field name" placeholder="name" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input className="lb-input lb-input-mono" aria-label="New field type" value={fieldType} onChange={(e) => setFieldType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="lb-pill lb-pill-small" onClick={add}>
            Add
          </button>
          <button className="lb-pill lb-pill-small" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="lb-link lb-field-add" onClick={() => setAdding(true)}>
          + field
        </button>
      )}
      {error && (
        <span className="lb-edit-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
