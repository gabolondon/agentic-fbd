export type IssueLevel = 'error' | 'warning' | 'notice';

export interface Issue {
  level: IssueLevel;
  /** Stable machine-readable code, e.g. "schema", "duplicate-id", "unknown-port". */
  code: string;
  /** JSON pointer or id path that locates the problem. */
  path: string;
  message: string;
  /** One imperative line saying what to change. Absent when there is nothing useful to add. */
  hint?: string;
}
