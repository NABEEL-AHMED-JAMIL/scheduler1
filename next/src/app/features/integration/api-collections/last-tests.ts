import { Injectable, signal } from '@angular/core';
import { RunResult } from './api-collections.model';

export interface LastTest { outcome: RunResult['outcome']; statusCode?: number | null; durationMs: number; }

/**
 * The last test of each API in this browser session, for the collection's Last test column. The service keeps
 * every call in its call log, but the console has no read of it yet; until it does, the column says what was
 * tested here, and "not tested" otherwise.
 */
@Injectable({ providedIn: 'root' })
export class LastTests {
  private readonly byRequest = signal<ReadonlyMap<number, LastTest>>(new Map());
  readonly all = this.byRequest.asReadonly();

  record(requestId: number, result: RunResult): void {
    this.byRequest.update(map => new Map(map).set(requestId, { outcome: result.outcome, statusCode: result.statusCode, durationMs: result.durationMs }));
  }
}
