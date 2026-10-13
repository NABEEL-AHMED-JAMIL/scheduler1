import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { forkJoin } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { formatSize } from '../../../shared/ui/format-size';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { RetentionApi } from './retention.api';
import { RetentionAuditLine, RetentionPass, readable, stateOf } from './retention.model';

export interface RetentionHistoryPanelData {
  tenantId: number | null;
}

const LABELS: Record<string, string> = {
  RUN_OUTPUTS: 'Run outputs', RUN_LOGS: 'Run logs', FILES: 'Uploaded files', DOCUMENTS: 'Documents', FORM_SUBMISSIONS: 'Form submissions',
  AI_CONVERSATIONS: 'AI conversations', NOTIFICATIONS: 'Notifications', AUDIT: 'Audit records',
};

/**
 * MIG-354: what retention did in the workspace -- its last passes, each class's cutoff, what was eligible and what went
 * (the pass's own record), and the retention audit: every change to the policy, the holds and the confirmations, with
 * who made it. Read-only, over the right of the page.
 */
@Component({
  selector: 'app-retention-history-panel',
  imports: [SidePanel, ServerTimePipe],
  template: `
    <app-side-panel heading="Retention history" subtitle="The last passes and every change, with who made it" data-test="retention-history-panel">
      @if (error()) {
        <p class="text-sm text-crit-500" role="alert">{{ error() }}</p>
      } @else if (loaded()) {
        <div class="flex flex-col gap-4">
          <section aria-labelledby="retention-passes-title">
            <h3 id="retention-passes-title" class="font-semibold text-sm mb-2">Passes</h3>
            @if (passes().length) {
              <ul class="flex flex-col gap-3">
                @for (p of passes(); track p.passId) {
                  <li class="card p-4 flex flex-col gap-2" [attr.data-pass]="p.passId">
                    <div class="flex flex-wrap items-center gap-2 text-sm">
                      <span class="font-medium">Pass {{ p.passId }}</span>
                      <span class="pill" [class]="'pill pill-' + stateOf(p.state).tone">{{ stateOf(p.state).label }}</span>
                      <span class="text-[color:var(--text-muted)]">{{ how(p.startedHow) }} · {{ p.startedAt | serverTime:'recent' }}</span>
                      <span class="ml-auto">Removed {{ p.deleted.toLocaleString('en-US') }}{{ p.bytes ? ', ' + formatSize(p.bytes) : '' }}</span>
                    </div>
                    @if (p.classes?.length) {
                      <table class="table-modern text-sm" aria-label="What the pass did per kind of data">
                        <thead><tr><th scope="col">Data</th><th scope="col">Cutoff</th><th scope="col">Eligible</th><th scope="col">Removed</th><th scope="col">Result</th></tr></thead>
                        <tbody>
                          @for (c of p.classes; track c.dataClass) {
                            @if (c.state !== 'OFF') {
                              <tr>
                                <th scope="row">{{ label(c.dataClass) }}</th>
                                <td>{{ c.cutoff ? (c.cutoff | serverTime:'date') : '—' }}</td>
                                <td>{{ c.eligible.toLocaleString('en-US') }} of {{ c.total.toLocaleString('en-US') }}</td>
                                <td>{{ c.deleted.toLocaleString('en-US') }}</td>
                                <td><span [title]="readable(c.note)">{{ stateOf(c.state).label }}</span></td>
                              </tr>
                            }
                          }
                        </tbody>
                      </table>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">No pass yet.</p>
            }
          </section>
          <section aria-labelledby="retention-audit-title">
            <h3 id="retention-audit-title" class="font-semibold text-sm mb-2">Changes and events</h3>
            @if (audit().length) {
              <ul class="flex flex-col gap-1.5 text-sm">
                @for (a of audit(); track a.id) {
                  <li class="flex gap-3" [attr.data-audit]="a.action">
                    <span class="shrink-0 w-32 text-[color:var(--text-muted)]">{{ a.at | serverTime:'recent' }}</span>
                    <span class="min-w-0">{{ readable(a.detail) }}
                      <span class="text-xs text-[color:var(--text-muted)]">{{ a.actorUserId ? 'User ' + a.actorUserId : 'The daily pass' }}</span>
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">Nothing recorded yet.</p>
            }
          </section>
        </div>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)] flex items-center gap-2"><span class="spinner"></span>Reading the history…</p>
      }
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close()">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class RetentionHistoryPanel implements OnInit {
  readonly ref = inject<DialogRef<void, RetentionHistoryPanel>>(DialogRef);
  readonly data = inject<RetentionHistoryPanelData>(DIALOG_DATA);
  private readonly api = inject(RetentionApi);

  readonly passes = signal<RetentionPass[]>([]);
  readonly audit = signal<RetentionAuditLine[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');

  readonly stateOf = stateOf;
  readonly readable = readable;
  readonly formatSize = formatSize;

  ngOnInit(): void {
    forkJoin([this.api.passes(this.data.tenantId, 10), this.api.audit(this.data.tenantId, 100)]).subscribe({
      next: ([p, a]) => {
        if (p?.status !== API_SUCCESS || a?.status !== API_SUCCESS) {
          this.error.set((p?.status !== API_SUCCESS ? p?.message : a?.message) || 'The history could not be read.');
          return;
        }
        this.passes.set(p.data ?? []);
        this.audit.set(a.data ?? []);
        this.loaded.set(true);
      },
      error: err => this.error.set(refusal(err, 'The history could not be read.')),
    });
  }

  label(dataClass: string): string {
    return LABELS[dataClass] ?? dataClass;
  }

  how(startedHow: string): string {
    return startedHow === 'MANUAL' ? 'Run now' : startedHow === 'RESUME' ? 'Continued' : 'Daily';
  }
}
