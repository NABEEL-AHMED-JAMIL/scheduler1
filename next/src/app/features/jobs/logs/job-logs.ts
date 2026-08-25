import { Component, OnDestroy, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StickToBottom } from '../../../shared/ui/stick-to-bottom';
import { Icon } from '../../../shared/ui/icon';
import { RankedBar } from '../../../shared/charts/ranked-bar';
import { StatusPill } from '../../../shared/ui/status-pill';

interface AuditLog {
  jobAuditLogId?: number;
  jobQueueId?: number;
  jobId?: number;
  logsDetail?: string;
  dateCreated?: string;
}

@Component({
  selector: 'app-job-logs',
  imports: [StickToBottom, Icon, DatePipe, RouterLink, TableShell, RankedBar, StatusPill],
  templateUrl: './job-logs.html',
})
export class JobLogs implements OnInit, OnDestroy {
  readonly jobId = input.required<string>();
  readonly jobQueueId = input.required<string>();

  /** Both ids come from the URL, so both are text until proven to be numbers. */
  private validIds(): boolean {
    const isId = (value: string) => /^\d+$/.test((value ?? '').trim());
    return isId(this.jobId()) && isId(this.jobQueueId());
  }

  private readonly http = inject(HttpClient);

  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly showInsights = signal(false);
  /** The run's own start time anchors the first gap, so time spent before the first log shows. */
  readonly runStartedAt = signal<string | null>(null);
  /** The job and the specific run, so a log line has the context the old screen showed. */
  readonly job = signal<any | null>(null);
  readonly run = signal<any | null>(null);
  readonly showDetail = signal(true);

  /**
   * Three ways to read the same entries, as the legacy screen had. Timeline for following a
   * run step by step, table for scanning and sorting by eye, console for the raw stream when
   * you want it to look like the log file it came from.
   */
  readonly view = signal<'timeline' | 'table' | 'console'>('timeline');
  readonly views = [
    { key: 'timeline' as const, label: 'Timeline', icon: 'clock' },
    { key: 'table' as const,    label: 'Table',    icon: 'list' },
    { key: 'console' as const,  label: 'Console',  icon: 'terminal' },
  ];

  readonly refreshing = signal(false);
  readonly live = signal(true);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** A run that has finished will not gain entries, so polling it is pure waste. */
  readonly stillRunning = computed(() => {
    const status = (this.run()?.jobStatus ?? '').toLowerCase();
    if (!status) return false;
    return !['completed', 'failed', 'interrupt', 'skip', 'missed', 'stop'].includes(status);
  });

  readonly autoRefreshing = computed(() => this.live() && this.stillRunning());

  constructor() {
    // Re-arms after every load, and stops on its own once the run reaches a terminal status.
    effect(() => {
      const on = this.autoRefreshing();
      this.clearTimer();
      if (on) this.timer = setTimeout(() => this.refresh(), 5000);
    });
  }

  ngOnDestroy(): void { this.clearTimer(); }

  private clearTimer(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** Manual reload; leaves the spinner-free path alone so the list does not blank out. */
  refresh(): void {
    this.refreshing.set(true);
    this.load(true);
  }

  toggleLive(): void { this.live.update(v => !v); }

  /**
   * Seconds between one log line and the next. A job that looks "slow" is usually waiting in
   * one specific step, and the tall bar is that step -- far quicker to spot than reading
   * timestamps down a column.
   */
  duration(): string {
    const run = this.run();
    if (!run?.startTime || !run?.endTime) return '—';
    const seconds = (new Date(run.endTime).getTime() - new Date(run.startTime).getTime()) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }

  /** How many bars stay readable at once; beyond this the chart shows a window. */

  /**
   * A gap is called a stall when it is both more than twice the average and over five
   * seconds -- the second test stops a run whose entries are milliseconds apart from
   * flagging half its bars. This colouring is the diagnostic value of the chart: it is how
   * you find where a run actually sat waiting.
   */
  readonly coloured = computed(() => {
    const all = this.gaps();
    if (!all.length) return [];
    const avg = all.reduce((sum, g) => sum + g.value, 0) / all.length;
    return all.map(g => ({
      ...g,
      color: g.value > avg * 2 && g.value > 5
        ? 'var(--color-warn-500)'
        : 'var(--color-brand-500)',
      stalled: g.value > avg * 2 && g.value > 5,
    }));
  });

  readonly stallCount = computed(() => this.coloured().filter(g => g.stalled).length);

  /**
   * The longest waits, not every interval. A bar per entry meant 368 bars whose labels
   * overlapped into a smear, and because one 22.5s stall set the scale the other 367 sat at
   * zero height -- the chart answered nothing while taking a screen to do it. The question
   * this is here for is "where did the run sit waiting", so it shows exactly that, ranked,
   * and stays readable whether the run has ten entries or ten thousand.
   */
  readonly topGaps = computed(() => {
    const stalls = this.coloured().filter(g => g.value > 0);
    return [...stalls]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map(g => ({
        name: `Before ${g.name}`,
        value: g.value,
        display: g.value >= 60
          ? `${Math.floor(g.value / 60)}m ${Math.round(g.value % 60)}s`
          : `${g.value}s`,
        color: g.color,
      }));
  });

  /**
   * The denominator is the span from the first entry to the last, which is not the same as
   * the run's own duration: a worker can write a line against a finished run's id, and this
   * database has 30 such rows -- one of them a day after its run ended, which turned a 1m58s
   * run into a 25-hour "gap". Calling that share "of the run's elapsed time" was wrong, so
   * it says what it actually measures and the late entries are called out separately.
   */
  readonly gapSummary = computed(() => {
    const all = this.gaps();
    if (!all.length) return null;
    const total = all.reduce((sum, g) => sum + g.value, 0);
    const shown = this.topGaps().reduce((sum, g) => sum + g.value, 0);
    return {
      total: Math.round(total * 10) / 10,
      totalLabel: this.humanSeconds(total),
      shownShare: total > 0 ? Math.round((shown / total) * 100) : 0,
      entries: all.length,
    };
  });

  /** Entries stamped after the run finished -- they inflate every gap that follows them. */
  readonly lateEntries = computed(() => {
    const ended = this.run()?.endTime;
    if (!ended) return 0;
    const cutoff = new Date(ended).getTime();
    if (!Number.isFinite(cutoff)) return 0;
    return this.logs().filter(row => {
      const at = row.dateCreated ? new Date(row.dateCreated).getTime() : NaN;
      return Number.isFinite(at) && at > cutoff + 1000;
    }).length;
  });

  private humanSeconds(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  }

  readonly gaps = computed(() => {
    const rows = [...this.logs()]
      .filter(row => !!row.dateCreated)
      .sort((a, b) => new Date(a.dateCreated!).getTime() - new Date(b.dateCreated!).getTime());
    if (!rows.length) return [];

    const started = this.runStartedAt();
    const anchors: { at: number; label: string }[] = [];
    if (started) {
      const t = new Date(started).getTime();
      if (Number.isFinite(t)) anchors.push({ at: t, label: 'Start' });
    }
    rows.forEach((row, index) =>
      anchors.push({ at: new Date(row.dateCreated!).getTime(), label: `#${index + 1}` }));

    if (anchors.length < 2) return [];
    const out: { name: string; value: number }[] = [];
    for (let i = 1; i < anchors.length; i++) {
      const seconds = (anchors[i].at - anchors[i - 1].at) / 1000;
      if (!Number.isFinite(seconds)) continue;
      out.push({ name: anchors[i].label, value: Math.max(0, Math.round(seconds * 10) / 10) });
    }
    return out;
  });

  readonly slowestGap = computed(() => {
    const list = this.gaps();
    if (!list.length) return null;
    return list.reduce((worst, g) => (g.value > worst.value ? g : worst), list[0]);
  });

  readonly hasInsights = computed(() => this.gaps().length > 1);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.logs();
    return this.logs().filter(log => (log.logsDetail ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  /** `quiet` keeps the list on screen during an auto-refresh instead of blanking it. */
  load(quiet = false): void {
    // A link built from a missing id arrives here as the literal text "undefined", and the
    // server answers with a Java type-conversion error that means nothing to whoever clicked.
    // Refuse it here and say what actually went wrong.
    if (!this.validIds()) {
      this.loading.set(false);
      this.error.set('That link is missing the run it refers to. Open the run from the job\'s '
        + 'history instead.');
      return;
    }

    if (!quiet) this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<AuditLog[]>>(`${API_BASE}/sourceJob.json/findSourceJobAuditLog`, {
      params: { jobId: this.jobId(), jobQueueId: this.jobQueueId() },
    }).subscribe({
      next: response => {
        this.loading.set(false);
        this.refreshing.set(false);
        if (response.status === API_SUCCESS) {
          const data = response.data as any;
          // The payload is { auditLogs, sourceJob, sourceJobQueue }. This read "jobAuditLogs",
          // which never matched, so the screen reported no logs for every run.
          this.logs.set(Array.isArray(data) ? data : (data?.auditLogs ?? []));
          this.runStartedAt.set(data?.sourceJobQueue?.startTime ?? null);
          // The same call already carries both -- there is no reason to fetch them again.
          this.job.set(data?.sourceJob ?? null);
          this.run.set(data?.sourceJobQueue ?? null);
        } else {
          this.error.set(response.message);
        }
      },
      error: err => {
        this.loading.set(false);
        this.refreshing.set(false);
        this.error.set(err?.error?.message || 'Could not load the logs.');
      },
    });
  }

  /** Workers prefix nothing, so severity is inferred from the wording. */
  toneOf(detail?: string): string {
    const text = (detail ?? '').toLowerCase();
    if (/\b(fail|error|exception|could not|unable)\b/.test(text)) return 'var(--color-crit-500)';
    if (/\b(warn|skip|missed|retry)\b/.test(text)) return 'var(--color-warn-500)';
    if (/\b(complete|success|done|finished)\b/.test(text)) return 'var(--color-ok-500)';
    return 'var(--border-strong)';
  }
}
