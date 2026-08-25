import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { ThemeService } from '../../core/theme.service';

/**
 * The public front door.
 *
 * Everything named here is something the console genuinely does -- the capabilities come from
 * the endpoints and the scheduler's real behaviour, so a visitor who signs in finds what the
 * page promised. The hero shows the product rather than describing it: the panel on the right
 * carries the jobs table's own shape, built from the same tokens.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Icon],
  styles: [`
    :host { display: block; }

    /* The hero is one deep surface in both themes rather than a tint of the page, so the
       product panel on it reads as lit from within. Stated explicitly -- a transparent hero
       would borrow whichever ground happened to sit behind it. */
    .hero {
      background:
        radial-gradient(70rem 40rem at 12% -20%, rgb(79 70 229 / 0.55), transparent 62%),
        radial-gradient(55rem 32rem at 88% 4%, rgb(56 189 248 / 0.20), transparent 60%),
        linear-gradient(180deg, #141833 0%, #0f1220 100%);
      color: #eef0fd;
    }
    .hero-sub     { color: rgb(238 240 253 / 0.72); }
    .hero-eyebrow { color: rgb(159 165 243 / 0.95); }

    /* The mock console panel keeps its own surface, not the page's, so it stays legible on the
       dark hero whichever theme the visitor is in. */
    .panel      { background: #171b2b; border: 1px solid rgb(255 255 255 / 0.09);
                  box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.55); }
    .panel-head { background: rgb(255 255 255 / 0.035); border-bottom: 1px solid rgb(255 255 255 / 0.07); }
    .panel-row  { border-bottom: 1px solid rgb(255 255 255 / 0.05); }
    .panel-dim  { color: rgb(238 240 253 / 0.55); }
    .panel-key  { color: rgb(238 240 253 / 0.92); }
    .chip-ok    { background: rgb(34 197 94 / 0.16);   color: #86efac; }
    .chip-run   { background: rgb(79 70 229 / 0.30);   color: #c4c9f9; }
    .chip-wait  { background: rgb(255 255 255 / 0.09); color: rgb(238 240 253 / 0.72); }

    /* Run bars drawn as plain divs, so a public page needs no charting code. */
    .spark      { background: rgb(159 165 243 / 0.85); border-radius: 2px; }
    .spark-idle { background: rgb(255 255 255 / 0.14); border-radius: 2px; }

    /* The capabilities are one ruled block rather than nine cards, so they read as a table of
       contents instead of nine boxes competing for attention. */
    .cap { border-color: var(--border-subtle); }
    @media (min-width: 640px) {
      .cap { border-left-width: 1px; }
      .cap:nth-child(2n+1) { border-left-width: 0; }
    }
    @media (min-width: 1024px) {
      .cap:nth-child(2n+1) { border-left-width: 1px; }
      .cap:nth-child(3n+1) { border-left-width: 0; }
    }

    /* The steps are a sequence, so a rule runs behind them and the markers sit on it. */
    @media (min-width: 1024px) {
      .step-line::before {
        content: ''; position: absolute; left: 1rem; right: 1rem; top: 1.05rem; height: 1px;
        background: var(--border-subtle);
      }
    }

    .rise { animation: rise .55s cubic-bezier(.22,.61,.36,1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .rise { animation: none; } }
  `],
  template: `
    <div class="min-h-screen flex flex-col" style="background: var(--surface-page);">

      <!-- Hero ------------------------------------------------------------------- -->
      <div class="hero">
        <header>
          <div class="mx-auto w-full max-w-6xl px-5 h-16 flex items-center gap-3">
            <div class="size-7 rounded-md bg-brand-500 grid place-items-center text-white text-sm font-bold">E</div>
            <span class="font-semibold text-[15px] tracking-tight">ETL Console</span>
            <div class="ml-auto flex items-center gap-1.5">
              <a routerLink="/docs" class="btn btn-ghost btn-sm hidden sm:inline-flex"
                 style="color: inherit;">Setup guide</a>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" style="color: inherit;"
                      [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                      (click)="theme.toggle()">
                <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
              </button>
              <a routerLink="/login" class="btn btn-primary btn-sm">Sign in</a>
            </div>
          </div>
        </header>

        <div class="mx-auto w-full max-w-6xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24
                    grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div class="rise">
            <p class="hero-eyebrow text-xs uppercase tracking-[0.14em] mb-4">
              Data pipeline operations
            </p>
            <h1 class="text-4xl sm:text-5xl font-semibold leading-[1.08] tracking-tight text-balance">
              Put your pipelines on a timetable.
            </h1>
            <p class="hero-sub mt-5 text-base sm:text-lg leading-relaxed max-w-xl">
              Define a task once, bind it to a schedule, and let it run. Every run keeps its
              logs, its output and its outcome — so a question about last Tuesday has an answer.
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <a routerLink="/login" class="btn btn-primary">
                Sign in<app-icon name="arrowRight" size="0.95em" />
              </a>
              <a routerLink="/request-workspace" class="btn btn-default btn-sm">
                Request a workspace
              </a>
              <a routerLink="/docs" class="link-inline text-sm" style="color: #c4c9f9;">
                Read the setup guide
              </a>
            </div>

            <dl class="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              @for (fact of facts; track fact.label) {
                <div>
                  <dt class="hero-sub text-xs uppercase tracking-wider">{{ fact.label }}</dt>
                  <dd class="text-xl font-semibold mt-0.5">{{ fact.value }}</dd>
                </div>
              }
            </dl>
          </div>

          <!-- Console preview: the jobs table's own shape, so it looks like what you get. -->
          <div class="rise" style="animation-delay: .12s;" aria-hidden="true">
            <div class="panel rounded-xl overflow-hidden">
              <div class="panel-head px-4 py-3 flex items-center gap-2">
                <span class="size-2 rounded-full" style="background: #34d399;"></span>
                <span class="text-xs panel-key font-medium">Source Jobs</span>
                <span class="text-[11px] panel-dim ml-auto mono">4 scheduled</span>
              </div>

              <div class="px-4 py-2.5 flex items-center gap-3 text-[11px] panel-dim uppercase tracking-wider">
                <span class="flex-1">Job</span>
                <span class="w-24 hidden sm:block">Schedule</span>
                <span class="w-20 text-right">Status</span>
              </div>

              @for (row of previewRows; track row.name) {
                <div class="panel-row px-4 py-3 flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="text-[13px] panel-key truncate">{{ row.name }}</div>
                    <div class="text-[11px] panel-dim mono truncate">{{ row.task }}</div>
                  </div>
                  <div class="w-24 hidden sm:block text-[11px] panel-dim mono">{{ row.schedule }}</div>
                  <div class="w-20 flex justify-end">
                    <span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap"
                          [class]="row.chip">{{ row.status }}</span>
                  </div>
                </div>
              }

              <div class="px-4 py-3.5">
                <div class="text-[11px] panel-dim uppercase tracking-wider mb-2">Runs this week</div>
                <div class="flex items-end gap-1 h-12">
                  @for (bar of bars; track $index) {
                    <div class="flex-1" [class]="bar > 0 ? 'spark' : 'spark-idle'"
                         [style.height.%]="bar > 0 ? bar : 6"></div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Capabilities ------------------------------------------------------------ -->
      <section class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
        <div class="max-w-2xl">
          <h2 class="text-2xl font-semibold tracking-tight">Everything a run needs, in one place</h2>
          <p class="mt-2 text-[color:var(--text-secondary)] leading-relaxed">
            Scheduling, storage, reporting and access — so operating a pipeline does not mean
            stitching four tools together.
          </p>
        </div>

        <div class="mt-10 grid sm:grid-cols-2 lg:grid-cols-3">
          @for (item of capabilities; track item.title) {
            <div class="cap border-t sm:border-t-0 sm:border-b py-6 sm:px-6">
              <span class="stat-glyph"><app-icon [name]="item.icon" /></span>
              <h3 class="mt-3 text-sm font-semibold">{{ item.title }}</h3>
              <p class="mt-1.5 text-sm text-[color:var(--text-secondary)] leading-relaxed">
                {{ item.body }}
              </p>
            </div>
          }
        </div>
      </section>

      <!-- How a run happens -------------------------------------------------------- -->
      <!-- Raised, not inset: --surface-inset sits two shades from the page, so as a full-width
           band it was invisible. Alternating with the raised surface gives the page its rhythm. -->
      <section class="border-y" style="background: var(--surface-raised); border-color: var(--border-subtle);">
        <div class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <h2 class="text-2xl font-semibold tracking-tight">How a run happens</h2>
          <p class="mt-2 text-[color:var(--text-secondary)]">
            Four steps, and the console shows you each of them.
          </p>

          <ol class="mt-10 relative step-line grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            @for (step of steps; track step.title; let i = $index) {
              <li class="relative">
                <div class="size-[2.1rem] rounded-full grid place-items-center text-xs font-semibold relative z-10"
                     style="background: var(--surface-raised); border: 1px solid var(--border-subtle);
                            color: var(--color-brand-500);">
                  {{ i + 1 }}
                </div>
                <h3 class="mt-3.5 text-sm font-semibold">{{ step.title }}</h3>
                <p class="mt-1.5 text-sm text-[color:var(--text-secondary)] leading-relaxed">
                  {{ step.body }}
                </p>
              </li>
            }
          </ol>
        </div>
      </section>

      <!-- Close -------------------------------------------------------------------- -->
      <section class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
        <div class="card p-8 sm:p-10 flex flex-wrap items-center gap-6">
          <div class="min-w-0">
            <h2 class="text-xl font-semibold tracking-tight">Ready when you are</h2>
            <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
              Sign in to see your jobs, their history and what they wrote.
            </p>
          </div>
          <a routerLink="/login" class="btn btn-primary ml-auto">
            Sign in<app-icon name="arrowRight" size="0.95em" />
          </a>
        </div>
      </section>

      <footer class="mt-auto border-t" style="border-color: var(--border-subtle);">
        <div class="mx-auto w-full max-w-6xl px-5 py-6 flex flex-wrap items-center gap-3">
          <span class="text-sm text-[color:var(--text-muted)]">
            ETL Console — pipeline scheduling and run history.
          </span>
          <a routerLink="/docs" class="link-inline ml-auto text-sm">Setup guide</a>
          <a routerLink="/login" class="link-inline text-sm">Sign in</a>
        </div>
      </footer>
    </div>
  `,
})
export class Landing {
  readonly theme = inject(ThemeService);

  /**
   * What the console supports, not how much anyone has run through it. A landing page claiming
   * "12,000 pipelines run daily" would be describing somebody else's install.
   */
  readonly facts = [
    { label: 'Schedule types', value: '5' },
    { label: 'Storage backends', value: '4' },
    { label: 'Export formats', value: 'CSV · XLSX' },
  ];

  /** The shape of a real jobs table, so the panel reads as the product rather than an artwork. */
  readonly previewRows = [
    { name: 'Port disruption — nightly load', task: 'Hurricane Data Task',
      schedule: 'Daily 03:00', status: 'Completed', chip: 'chip-ok' },
    { name: 'Claims baseline — hourly refresh', task: 'Catastrophe Claims',
      schedule: 'Hourly', status: 'Running', chip: 'chip-run' },
    { name: 'Cat bond loss — Mon and Thu', task: 'Loss History',
      schedule: 'Mon, Thu', status: 'Queued', chip: 'chip-wait' },
    { name: 'Crop origin risk — month end', task: 'Weather Risk',
      schedule: 'Last day', status: 'Completed', chip: 'chip-ok' },
  ];

  /** Relative bar heights; a zero is a quiet day rather than a missing one. */
  readonly bars = [38, 62, 45, 88, 54, 0, 0, 71, 96, 60, 42, 78];

  readonly capabilities = [
    { icon: 'clock', title: 'Schedules that fit the work',
      body: 'By the minute, hour, day, chosen weekdays, or a date each month — including the '
          + 'last day. Give a schedule an end date and it stops on its own.' },
    { icon: 'play', title: 'Run on demand, or skip one',
      body: 'Start any job by hand without disturbing its timetable, or skip the next run and '
          + 'leave the rest in place.' },
    { icon: 'history', title: 'Every run accounted for',
      body: 'Queued, running, completed, failed and skipped are all recorded, and a run missed '
          + 'during downtime is written down rather than quietly forgotten.' },
    { icon: 'terminal', title: 'Logs while it runs',
      body: 'Each run keeps its own log, streamed as it happens and kept afterwards, so a '
          + 'failure can be read rather than guessed at.' },
    { icon: 'cloud', title: 'Storage where you keep it',
      body: 'S3, Azure, MinIO and FTP connections. Browse buckets, upload, preview a file and '
          + 'send a job’s output straight to one.' },
    { icon: 'chart', title: 'Reports you can take away',
      body: 'Group runs by task, outcome or day, measure them how you like, and export the '
          + 'result as CSV or XLSX — to your machine or to a bucket.' },
    { icon: 'database', title: 'Queries on a timetable',
      body: 'Register a database, save a query, preview it, and have it run to a bucket on a '
          + 'schedule of its own.' },
    { icon: 'inbox', title: 'Forms that configure work',
      body: 'Build a form, share its link, and turn what comes back into a task’s configuration '
          + 'without hand-writing XML.' },
    { icon: 'shield', title: 'Separated by tenant',
      body: 'Every job, task, bucket and user belongs to a tenant, and roles decide what each '
          + 'person can reach.' },
  ];

  readonly steps = [
    { title: 'Describe the task',
      body: 'What to fetch or process, where it reads from and where it writes.' },
    { title: 'Bind it to a job',
      body: 'A job gives the task a timetable, a priority and someone responsible for it.' },
    { title: 'Let it run',
      body: 'The scheduler queues it when due; workers pick it up and report as they go.' },
    { title: 'Read the outcome',
      body: 'Status, logs and output are kept against that run, and roll up into the reports.' },
  ];
}
