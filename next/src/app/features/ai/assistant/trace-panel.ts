import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { formatSize } from '../../../shared/ui/format-size';
import { ToolCall, outcomeLook } from './assistant.model';

/** The run a trace belongs to, as progress or the trace answers it. */
export interface TraceRun {
  toolRunId: number;
  status: string;
  model?: string | null;
  toolMode?: string | null;
  phase?: string | null;
  rounds?: number;
  toolCallCount?: number;
  maxToolCalls?: number;
  tokensIn?: number;
  tokensOut?: number;
  tokenBudget?: number;
  elapsedMs?: number | null;
  timeBudgetMs?: number;
  error?: string | null;
}

/** A call's arguments, pretty when they are JSON (they are masked by the server; a secret never comes back). */
export function prettyArguments(raw: string | null | undefined): string {
  if (!raw || raw === '{}') return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Each call's bar as a share of the longest call: the trace view's waterfall, in the run's own order. */
export function bars(calls: readonly ToolCall[]): { seq: number; percent: number }[] {
  const longest = Math.max(1, ...calls.map(c => c.durationMs ?? 0));
  return calls.map(c => ({ seq: c.seq, percent: c.durationMs == null ? 0 : Math.max(2, Math.round((c.durationMs / longest) * 100)) }));
}

/**
 * The tool calls of one assistant run (the "trace view" pattern): a header with the run's model, how tools were asked
 * (native or the JSON protocol), turns, tokens and time against their budgets; then each call in order -- tool, outcome,
 * duration as a bar, rows and size -- expandable to its (masked) arguments and the reason a refused, blocked or failed
 * call gives. Live while the run works: the calls arrive as the loop makes them.
 */
@Component({
  selector: 'app-trace-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  styles: [`
    .tp-bar { flex: 1 1 0; min-width: 3rem; height: 0.375rem; border-radius: 9999px; background: var(--surface-sunken); overflow: hidden; }
    .tp-fill { display: block; height: 100%; border-radius: 9999px; background: var(--accent-mark); }
    .tp-fill.crit { background: var(--crit-text); }
    .tp-args { max-height: 14rem; }
  `],
  template: `
    @if (run(); as r) {
      <div class="flex flex-col gap-3 min-w-0" [attr.data-trace]="r.toolRunId">
        <dl class="grid grid-cols-2 xl:grid-cols-4 gap-2 text-xs" data-trace-summary>
          <div class="rounded-md bg-sunken px-2.5 py-1.5 min-w-0"><dt class="text-[color:var(--text-muted)]">Model</dt>
            <dd class="font-medium truncate" [title]="r.model || ''">{{ r.model || '—' }}</dd></div>
          <div class="rounded-md bg-sunken px-2.5 py-1.5"><dt class="text-[color:var(--text-muted)]">Tool calling</dt>
            <dd class="font-medium">{{ modeText() }}</dd></div>
          <div class="rounded-md bg-sunken px-2.5 py-1.5"><dt class="text-[color:var(--text-muted)]">Turns · calls</dt>
            <dd class="font-medium">{{ r.rounds ?? 0 }} · {{ r.toolCallCount ?? calls().length }}{{ r.maxToolCalls ? ' of ' + r.maxToolCalls : '' }}</dd></div>
          <div class="rounded-md bg-sunken px-2.5 py-1.5"><dt class="text-[color:var(--text-muted)]">Time · tokens</dt>
            <dd class="font-medium">{{ seconds(r.elapsedMs) }} · {{ tokens() }}</dd></div>
        </dl>
        @if (live() && r.phase) {
          <p class="text-xs flex items-center gap-1.5 text-[color:var(--text-secondary)]" role="status">
            <span class="typing"><span></span><span></span><span></span></span>{{ r.phase }}
          </p>
        }
        @if (!calls().length) {
          <p class="text-sm text-[color:var(--text-muted)]">{{ live() ? 'No tool called yet.' : 'No tool was called: the answer is the model\\'s own.' }}</p>
        } @else {
          <ol class="flex flex-col gap-1 list-none m-0 p-0" aria-label="Tool calls">
            @for (c of calls(); track c.callId) {
              @let o = look(c.outcome);
              @let open = expanded().has(c.callId);
              <li class="rounded-md border border-subtle min-w-0" [attr.data-call]="c.toolName" [attr.data-outcome]="c.outcome">
                <button type="button" class="w-full text-left px-2.5 py-1.5 flex items-center gap-2 min-w-0 hover:bg-sunken rounded-md"
                        [attr.aria-expanded]="open" (click)="toggle(c.callId)">
                  <span class="text-[11px] text-[color:var(--text-muted)] w-5 shrink-0 tabular-nums">{{ c.seq }}</span>
                  <span class="mono text-xs font-medium truncate min-w-0 w-36 shrink-0" [title]="c.toolName">{{ c.toolName }}</span>
                  <span class="pill shrink-0" [class]="'pill pill-' + o.tone">{{ o.label }}</span>
                  <span class="tp-bar" aria-hidden="true">
                    <span class="tp-fill" [class.crit]="o.tone === 'crit'" [style.width.%]="barOf(c.seq)"></span>
                  </span>
                  <span class="text-[11px] text-[color:var(--text-muted)] shrink-0 tabular-nums w-16 text-right">{{ c.durationMs != null ? c.durationMs + ' ms' : '—' }}</span>
                  <app-icon [name]="open ? 'chevronUp' : 'chevronDown'" size="0.85em" class="shrink-0 text-[color:var(--text-muted)]" />
                </button>
                @if (open) {
                  <div class="px-2.5 pb-2 pt-0.5 flex flex-col gap-1.5 text-xs min-w-0">
                    @if (facts(c); as f) { <p class="text-[color:var(--text-secondary)]">{{ f }}</p> }
                    @if (c.reason) {
                      <p class="break-words" [class]="o.tone === 'crit' ? 'text-crit-500' : 'text-[color:var(--text-secondary)]'">{{ c.reason }}</p>
                    }
                    @if (args(c); as a) {
                      <pre class="tp-args mono text-[11px] whitespace-pre-wrap break-all rounded-md border border-subtle bg-sunken px-2 py-1.5 overflow-auto m-0">{{ a }}</pre>
                    } @else {
                      <p class="text-[color:var(--text-muted)]">No arguments.</p>
                    }
                  </div>
                }
              </li>
            }
          </ol>
        }
        @if (r.error) { <p class="text-xs text-crit-500 break-words" role="alert">{{ r.error }}</p> }
      </div>
    } @else {
      <p class="text-sm text-[color:var(--text-muted)]">Ask something: each tool the assistant calls shows here as it happens.</p>
    }
  `,
})
export class TracePanel {
  readonly run = input<TraceRun | null>(null);
  readonly calls = input<ToolCall[]>([]);
  readonly live = input(false);

  readonly expanded = signal<ReadonlySet<number>>(new Set());
  private readonly widths = computed(() => new Map(bars(this.calls()).map(b => [b.seq, b.percent])));

  readonly modeText = computed(() => {
    const mode = this.run()?.toolMode;
    return mode === 'native' ? 'Native' : mode === 'protocol' ? 'JSON protocol' : '—';
  });

  readonly tokens = computed(() => {
    const r = this.run();
    if (!r) return '';
    const used = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
    return r.tokenBudget ? `${used.toLocaleString('en-US')} of ${r.tokenBudget.toLocaleString('en-US')}` : used.toLocaleString('en-US');
  });

  toggle(callId: number): void {
    this.expanded.update(open => {
      const next = new Set(open);
      if (next.has(callId)) next.delete(callId); else next.add(callId);
      return next;
    });
  }

  barOf(seq: number): number { return this.widths().get(seq) ?? 0; }
  look(outcome: string) { return outcomeLook(outcome); }
  args(c: ToolCall): string { return prettyArguments(c.arguments); }
  seconds(ms: number | null | undefined): string { return ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }

  facts(c: ToolCall): string {
    const parts: string[] = [];
    if (c.toolKind) parts.push(c.toolKind === 'write' ? 'Write' : 'Read');
    if (c.httpStatus != null) parts.push(`HTTP ${c.httpStatus}`);
    if (c.resultRows != null) parts.push(`${c.resultRows} row${c.resultRows === 1 ? '' : 's'}`);
    if (c.resultBytes != null) parts.push(formatSize(c.resultBytes));
    return parts.join(' · ');
  }
}
