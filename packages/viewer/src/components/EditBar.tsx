import { useMemo, useState } from 'react';
import { countEdits, type Issue, type LogicDoc } from '@agentic-fbd/core';
import type { DraftState } from '../state/useDocument.ts';

// The bar at the bottom of the canvas while the user edits (design spec §6.9): how many changes
// are unsaved, Save and Discard; after a save, "Copy for agent" with the request to implement.

export interface Saved {
  summary: string;
  review: string | null;
}

interface Props {
  draft: DraftState | null;
  doc: LogicDoc;
  issues: Issue[];
  saved: Saved | null;
  saving: boolean;
  /** Why the last save failed. */
  error: string | null;
  /** False when the draft could not be written next to the diagram. */
  draftSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function EditBar({ draft, doc, issues, saved, saving, error, draftSaved, onSave, onDiscard }: Props) {
  const count = useMemo(() => (draft ? countEdits(draft.original, doc) : 0), [draft, doc]);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  if (draft) {
    const firstError = issues.find((i) => i.level === 'error');
    const problem = firstError?.message ?? error;
    return (
      <div className="lb-editbar" role="region" aria-label="Unsaved edits">
        {draft.changedOnDisk && (
          <p className="lb-editbar-note">The diagram changed on disk while you edited. Saving keeps your version; the other one is kept for review.</p>
        )}
        {!draftSaved && <p className="lb-editbar-note">Your edits could not be written next to the diagram; they are kept until you reload.</p>}
        <div className="lb-editbar-row">
          <b>{count === 0 ? 'No changes left' : `${count} unsaved ${count === 1 ? 'change' : 'changes'}`}</b>
          {problem && <span className="lb-editbar-error" title={problem}>{problem}</span>}
          <span className="lb-spacer" />
          {confirming ? (
            <>
              <span className="lb-muted">Discard every edit?</span>
              <button className="lb-pill" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
              <button
                className="lb-pill lb-pill-danger"
                onClick={() => {
                  setConfirming(false);
                  onDiscard();
                }}
              >
                Discard
              </button>
            </>
          ) : (
            <>
              <button className="lb-pill" onClick={() => (count === 0 ? onDiscard() : setConfirming(true))}>
                Discard
              </button>
              <button className="lb-button" disabled={!!firstError || count === 0 || saving} onClick={onSave}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!saved) return null;
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(saved.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="lb-editbar lb-editbar-saved" role="region" aria-label="Saved">
      <div className="lb-editbar-row">
        <b>Saved</b>
        <span className="lb-muted">Ask the agent to implement your edits.</span>
        <span className="lb-spacer" />
        {saved.summary && (
          <button className="lb-button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy for agent'}
          </button>
        )}
      </div>
      {saved.review && <p className="lb-editbar-note">The other version is in {saved.review} for the agent to review.</p>}
    </div>
  );
}
