import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';

/** One step on the way to a workspace's first run: what to do, where, and whether it is done. */
export interface StartStep {
  key: 'storage' | 'inbox' | 'topic' | 'registry' | 'pipeline' | 'schedule' | 'run';
  title: string;
  why: string;
  link: string;
  linkLabel: string;
  optional?: boolean;
  done: boolean;
}

/** What the workspace already has, read once: each part false when its read failed (the step then just shows). */
export interface StartState {
  storage: boolean; inbox: boolean; topic: boolean; registry: boolean; pipeline: boolean; schedule: boolean; run: boolean;
}

const STEPS: Omit<StartStep, 'done'>[] = [
  { key: 'storage', title: 'Connect your storage', link: '/integration/storage-connections', linkLabel: 'Storage connections',
    why: 'Where pipelines read files from and keep what they write: an S3, Azure, MinIO or FTP connection of your own.' },
  { key: 'inbox', title: 'Turn on the inbox and upload a file', link: '/documents/inbox', linkLabel: 'Inbox', optional: true,
    why: 'Files people upload land in your storage, each under a key a pipeline step can read. A schedule can also start when one arrives.' },
  { key: 'topic', title: 'Add a topic', link: '/configuration/kafka', linkLabel: 'Kafka & Topics',
    why: 'Every pipeline publishes on a topic. It goes through the platform’s Kafka connection unless you add your own.' },
  { key: 'registry', title: 'Define its registry task', link: '/configuration/task-registry', linkLabel: 'Task Registry',
    why: 'New pipeline there: an id, a name and the topic. This is what a pipeline picks as its registry task.' },
  { key: 'pipeline', title: 'Create the pipeline and build its steps', link: '/pipelines/new', linkLabel: 'New pipeline',
    why: 'Pick the topic and the registry task, create it, then Build its steps: read a file, work on the rows, keep the result.' },
  { key: 'schedule', title: 'Schedule it', link: '/pipelines/schedules/new', linkLabel: 'New schedule',
    why: 'A schedule says when the pipeline runs. Manual is fine to start with: it runs when you say so.' },
  { key: 'run', title: 'Run it and look at the output', link: '/pipelines/schedules', linkLabel: 'Schedules',
    why: 'Run now from the schedule’s menu. The run’s Logs page shows each step and the files it kept.' },
];

/** The checklist for a workspace in the state given: every step, each marked done or not. */
export function startSteps(state: StartState): StartStep[] {
  return STEPS.map(step => ({ ...step, done: state[step.key] }));
}

/** The hide-this-guide flag, per workspace and per browser: a convenience, so a refusal to store it is no error. */
const hiddenKey = (tenantId: unknown) => `etl_get_started_hidden:${tenantId ?? 'none'}`;

/**
 * MIG-324: a new organisation's first hour. A brand-new workspace's dashboard was six zero tiles and three empty charts,
 * none of which said what to do first, and the way to a first run crosses five screens in three menus. This card lists
 * the steps, ticks the ones the workspace has already taken (read from the same lists those screens show), and goes
 * away once a run has completed -- or when the administrator hides it.
 *
 * Only for someone who can build here: a tenant administrator in a SELF workspace. In a MANAGED workspace our team
 * builds the pipelines, and a platform administrator is not setting up a workspace of their own.
 */
@Component({
  selector: 'app-get-started',
  imports: [RouterLink, Icon],
  template: `
    @if (visible()) {
      <section class="card p-4" aria-labelledby="get-started-title">
        <div class="flex flex-wrap items-start gap-3 mb-3">
          <div class="flex-1 min-w-0 basis-80">
            <h2 id="get-started-title" class="text-sm font-semibold">Get your first pipeline running</h2>
            <p class="text-sm text-[color:var(--text-muted)] mt-0.5">
              {{ doneCount() }} of {{ steps().length }} done. Each step opens the screen it happens on; come back here for the next one.
            </p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="hide()"><app-icon name="close" />Hide this guide</button>
        </div>
        <ol class="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
          @for (step of steps(); track step.key; let i = $index) {
            <li class="flex items-start gap-2 rounded-card border border-[color:var(--border-subtle)] p-3" [attr.data-step]="step.key"
                [class.opacity-70]="step.done">
              <span class="shrink-0 mt-0.5" [attr.aria-label]="step.done ? 'Done' : 'To do'">
                @if (step.done) { <app-icon name="checkCircle" class="icon-ok" /> }
                @else { <span class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--border-subtle)] text-xs tabular">{{ i + 1 }}</span> }
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium">{{ step.title }}@if (step.optional) { <span class="text-xs font-normal text-[color:var(--text-muted)]"> (optional)</span> }</span>
                <span class="block text-xs text-[color:var(--text-muted)] mt-0.5">{{ step.why }}</span>
                <a class="link-inline text-xs mt-1 inline-block" [routerLink]="step.link">{{ step.linkLabel }}</a>
              </span>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class GetStarted implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly state = signal<StartState | null>(null);
  readonly hidden = signal(false);
  readonly steps = computed(() => { const s = this.state(); return s ? startSteps(s) : []; });
  readonly doneCount = computed(() => this.steps().filter(s => s.done).length);
  /** For a builder, until the first run completed or they hid it; nothing at all until the reads have answered. */
  readonly visible = computed(() => this.canSetUp() && !this.hidden() && !!this.state() && !this.state()!.run);
  private readonly canSetUp = computed(() => this.auth.canBuild() && !this.auth.isPlatformAdmin());

  ngOnInit(): void {
    if (!this.canSetUp()) return;
    try { this.hidden.set(localStorage.getItem(hiddenKey(this.auth.user()?.tenantId)) === '1'); } catch { /* shown */ }
    if (this.hidden()) return;
    this.read().subscribe(state => this.state.set(state));
  }

  hide(): void {
    this.hidden.set(true);
    try { localStorage.setItem(hiddenKey(this.auth.user()?.tenantId), '1'); } catch { /* hidden for this visit */ }
  }

  /** The seven answers at once, each from the list its own screen reads; a failed read counts as "not yet". */
  private read(): Observable<StartState> {
    const get = (path: string) => this.http.get<ApiResponse<any>>(`${API_BASE}${path}`).pipe(catchError(() => of(null)));
    const ok = (r: ApiResponse<any> | null) => !!r && r.status === API_SUCCESS;
    const rows = (r: ApiResponse<any> | null): any[] => {
      if (!ok(r)) return [];
      const data = r!.data;
      return Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
    };
    return forkJoin({
      storage: get('/storageConnection.json/fetchAllConnections').pipe(map(r => rows(r).length > 0)),
      inbox: get('/storage.json/inbox').pipe(map(r => ok(r) && !!r!.data?.configured)),
      topic: get('/setting.json/topics?q=&limit=1').pipe(map(r => rows(r).length > 0)),
      registry: get('/pipeline.json/list?page=1&limit=1').pipe(map(r => rows(r).length > 0)),
      pipeline: this.http.post<ApiResponse<any>>(`${API_BASE}/sourceTask.json/listSourceTask?page=1&limit=1`, {})
        .pipe(catchError(() => of(null)), map(r => rows(r).length > 0)),
      jobs: get('/sourceJob.json/listSourceJob?page=1&limit=50').pipe(map(r => rows(r))),
    }).pipe(map(({ jobs, ...rest }) => ({
      ...rest,
      schedule: jobs.length > 0,
      run: jobs.some(j => String(j?.jobRunningStatus ?? '').toLowerCase() === 'completed'),
    })));
  }
}
