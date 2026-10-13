import { Signal, computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiResponse } from '../../../core/api/api.config';

/**
 * Bulk review (owner, 2026-10-12: "can we give a bulk review?"): approve or reject many runs, tasks or documents in one
 * deliberate step. Every service decides each item on its own, with exactly the rules of a single decision, and writes an
 * audit entry per item carrying the bulk decision's id; the console only gathers the items, shows what will happen
 * (a dry run first), asks for a comment and, above {@link CONFIRM_ABOVE}, for the count typed back, then reports item by
 * item. The shared contract: scratchpad bulkreview/CONTRACT.md.
 */

/** At most this many items per bulk decision: the services refuse more. */
export const BULK_CAP = 100;
/** Above this many items to decide, the count is typed back before the decision is sent. */
export const CONFIRM_ABOVE = 25;
/** One comment applies to each item; the services keep at most this many characters. */
export const COMMENT_MAX = 500;

/** MIG-355 added retry: failed runs tried again, each by the single retry's rules (no comment). */
export type BulkAction = 'approve' | 'reject' | 'retry';

/** One item of a bulk answer: done (or "would be done" in a dry run), skipped with a reason, or failed. */
export interface BulkItem {
  id: number | string;
  label?: string | null;
  group?: string | null;
  link?: string | null;
  reason?: string | null;
  message?: string | null;
}

export interface BulkAnswer {
  bulkId: string;
  action: BulkAction;
  dryRun: boolean;
  requested: number;
  done: BulkItem[];
  skipped: BulkItem[];
  failed: BulkItem[];
}

/** What every bulk call carries besides its items. */
export interface BulkRequest {
  action: BulkAction;
  comment: string | null;
  bulkId: string;
  dryRun: boolean;
}

/** Every row matching the list's current filter and search, up to the cap, and how many match (null: not known). */
export interface BulkMatch<T> {
  rows: T[];
  total: number | null;
}

/**
 * A list's side of a bulk decision: how a row is named, the rows matching the list's filter, and the call that decides
 * them. The panel and the bar are the same for every list; only this differs.
 */
export interface BulkSource<T> {
  idOf(row: T): number;
  /** At most this many may be picked; {@link BULK_CAP} when absent (the bulk retry takes 50). */
  cap?: number;
  /** "task" and "tasks", "run" and "runs", "document" and "documents". */
  noun: readonly [string, string];
  /** What the items are counted by: "workflow", "pipeline", "document type". */
  groupNoun: string;
  /** The rows matching the list's current filter (absent: Select all matching is not offered). */
  matching?(): Observable<BulkMatch<T>>;
  send(rows: T[], request: BulkRequest): Observable<ApiResponse<BulkAnswer>>;
}

/** The skip reasons the services share, in words, in the order a reader meets them. */
export const REASON_TEXT: Record<string, string> = {
  'already-decided': 'Already decided',
  'not-yours': 'Not yours to decide',
  'individual-review': 'The pipeline requires individual review',
  'bulk-off': 'Bulk approve is off in this workspace',
  'not-completed': 'The run is not completed (failed, or still running)',
  'no-review': 'The pipeline asks for no internal review',
  'rule-failures': 'The document\'s rules fail, and the workspace policy keeps those out of bulk approve',
  'cannot-approve': 'Cannot be approved as it stands',
  'changed': 'Changed since it was listed',
  'not-approval': 'Not an approval',
  'not-found': 'Not found',
  // MIG-355: a retry's refusals (MIG-345's kinds).
  'run-not-failed': 'The run is not failed (already retried, or running again)',
  'run-in-flight': 'Another run of the pipeline is in flight',
  'pipeline-inactive': 'The pipeline is not active',
  'workspace-paused': 'The workspace is paused',
  'pipeline-changed': 'The pipeline changed before the failed step: run it again from the start',
  'input-changed': 'An input file changed since the run read it',
  'outputs-expired': 'The kept outputs of the steps before it expired',
  'not-resumable': 'Cannot resume from the failed step',
  // UX review 2026-10-13: a backfill's run is retried by its backfill (Runs › Backfills, Retry failed).
  'part-of-backfill': 'Part of a backfill: retry failed days from the backfill',
};

const REASON_ORDER = Object.keys(REASON_TEXT);

/** A reason code in words; an unknown code reads as itself, made readable. */
export function reasonText(code: string | null | undefined): string {
  if (!code) return 'Skipped';
  return REASON_TEXT[code] ?? code.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
}

export interface ItemGroup { key: string; label: string; items: BulkItem[]; }

/** Items under their group (pipeline, workflow, document type), largest first; items with no group last. */
export function byGroup(items: BulkItem[], none = 'Other'): ItemGroup[] {
  const groups = new Map<string, BulkItem[]>();
  for (const item of items) {
    const key = item.group?.trim() || '';
    const list = groups.get(key);
    if (list) list.push(item); else groups.set(key, [item]);
  }
  return [...groups].map(([key, list]) => ({ key, label: key || none, items: list }))
    .sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || b.items.length - a.items.length || a.label.localeCompare(b.label));
}

/** Skipped items under their reason, in words, in the shared order (an unknown reason after the known ones). */
export function byReason(items: BulkItem[]): ItemGroup[] {
  const groups = new Map<string, BulkItem[]>();
  for (const item of items) {
    const key = item.reason || 'skipped';
    const list = groups.get(key);
    if (list) list.push(item); else groups.set(key, [item]);
  }
  const rank = (key: string) => { const i = REASON_ORDER.indexOf(key); return i < 0 ? REASON_ORDER.length : i; };
  return [...groups].map(([key, list]) => ({ key, label: reasonText(key), items: list }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** "12 tasks", "1 task". */
export function countOf(n: number, noun: readonly [string, string]): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? noun[0] : noun[1]}`;
}

/** An item as a reader names it: its label, else "#id". */
export function itemLabel(item: BulkItem): string {
  return item.label?.trim() || `#${item.id}`;
}

/** The message of a refused call: the envelope's when there is one, else a sentence of our own. */
export function refusal(err: unknown, fallback: string): string {
  const e = err as { status?: number; error?: { message?: string } | string } | null;
  const message = e && typeof e.error === 'object' ? e.error?.message : null;
  if (message) return message;
  if (e?.status === 0) return 'The service could not be reached. Check the connection and try again.';
  return fallback;
}

export type PageState = 'none' | 'some' | 'all';

/**
 * Which rows are picked for a bulk decision. Rows are kept with their id (a document's revision travels with it), at
 * most {@link BULK_CAP}; a list clears it whenever its filter or search changes, so a selection never outlives the list it
 * was made from.
 */
export class BulkSelection<T> {
  private readonly picked = signal<Map<number, T>>(new Map());
  readonly count = computed(() => this.picked().size);
  readonly rows: Signal<T[]> = computed(() => [...this.picked().values()]);
  readonly ids: Signal<number[]> = computed(() => [...this.picked().keys()]);
  /** After Select all matching: how many matched (null: not known) and how many were taken. */
  readonly matched = signal<{ total: number | null; taken: number } | null>(null);
  /** Select all matching is reading the rows. */
  readonly matching = signal(false);
  readonly matchError = signal('');
  readonly full = computed(() => this.count() >= this.cap);
  /** The most that may be picked: the source's own cap, else BULK_CAP. */
  get cap(): number { return this.source.cap ?? BULK_CAP; }
  private reading?: Subscription;

  constructor(readonly source: BulkSource<T>) {}

  has(row: T): boolean {
    return this.picked().has(this.source.idOf(row));
  }

  hasId(id: number): boolean {
    return this.picked().has(id);
  }

  /** Picks or drops a row; false when picking it would pass the cap. */
  toggle(row: T, on = !this.has(row)): boolean {
    const id = this.source.idOf(row);
    const next = new Map(this.picked());
    if (on) {
      if (next.has(id)) return true;
      if (next.size >= this.cap) return false;
      next.set(id, row);
    } else {
      next.delete(id);
    }
    this.matched.set(null);
    this.picked.set(next);
    return true;
  }

  /** Every row of the page picked (up to the cap), or every one of them dropped. */
  setPage(rows: T[], on: boolean): void {
    const next = new Map(this.picked());
    for (const row of rows) {
      const id = this.source.idOf(row);
      if (!on) next.delete(id);
      else if (!next.has(id) && next.size < this.cap) next.set(id, row);
    }
    this.matched.set(null);
    this.picked.set(next);
  }

  /** How much of a page is picked: the header checkbox's checked or indeterminate state. */
  pageState(rows: T[]): PageState {
    if (!rows.length) return 'none';
    const n = rows.filter(r => this.has(r)).length;
    return n === 0 ? 'none' : n === rows.length ? 'all' : 'some';
  }

  /** Select all matching: the rows of the list's current filter, the first {@link BULK_CAP}. */
  selectMatching(): void {
    const read = this.source.matching?.();
    if (!read || this.matching()) return;
    this.matching.set(true);
    this.matchError.set('');
    this.reading = read.subscribe({
      next: match => {
        const next = new Map<number, T>();
        for (const row of match.rows) {
          if (next.size >= this.cap) break;
          next.set(this.source.idOf(row), row);
        }
        this.picked.set(next);
        this.matched.set({ total: match.total ?? null, taken: next.size });
        this.matching.set(false);
      },
      error: err => { this.matching.set(false); this.matchError.set(refusal(err, 'The matching items could not be read.')); },
    });
  }

  /** Drops every row, and stops a Select all matching still reading. */
  clear(): void {
    this.reading?.unsubscribe();
    this.reading = undefined;
    this.matching.set(false);
    this.matchError.set('');
    this.matched.set(null);
    if (this.picked().size) this.picked.set(new Map());
  }

  /** Drops the rows with these ids (decided, or gone from the list). */
  drop(ids: Iterable<number | string>): void {
    const next = new Map(this.picked());
    for (const id of ids) next.delete(Number(id));
    this.picked.set(next);
  }
}

/** A fresh id for one bulk decision: the dry run and the decision (and any retry of it) carry the same one. */
export function newBulkId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
