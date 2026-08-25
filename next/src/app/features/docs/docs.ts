import { AfterViewInit, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { ThemeService } from '../../core/theme.service';

interface Section { id: string; title: string; }

interface StepField { name: string; required: boolean; note: string; }

interface Step {
  id: string;
  title: string;
  intro: string;
  where?: string;
  fields?: StepField[];
  notes?: string[];
  warn?: string;
  /** Base name of a screenshot in public/docs; -light.png and -dark.png are expected. */
  shot?: string;
  shotCaption?: string;
}

/**
 * Setup documentation.
 *
 * Public, like the landing page, so it can be linked to and read before signing in -- it
 * describes the console's own screens and carries nothing tenant-specific.
 *
 * Every value stated here was read out of the server rather than assumed: the frequencies and
 * their allowed intervals come from ProcessTimeUtil, the topic pattern from the task type
 * validation, the roles from the security hierarchy, the field types from the dynamic form
 * service. If one of those changes, this page is wrong and should be changed with it.
 */
@Component({
  selector: 'app-docs',
  imports: [RouterLink, Icon],
  styles: [`
    :host { display: block; }
    .doc h2 { scroll-margin-top: 5rem; }
    .doc-body p { line-height: 1.7; }
    .toc-link.is-current { color: var(--color-brand-500); font-weight: 600; }
    /* A screenshot is a picture of a screen, so it is framed like one rather than floated on
       the page. max-width keeps a wide capture inside the column on a narrow viewport. */
    .doc-shot {
      display: block; width: 100%; max-width: 100%; height: auto;
      border-radius: 10px; border: 1px solid var(--border-subtle);
      box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.28);
      background: var(--surface-raised);
    }
    .num {
      display: grid; place-items: center; flex: none;
      width: 1.6rem; height: 1.6rem; border-radius: 999px;
      font-size: .75rem; font-weight: 600;
      background: var(--surface-inset); color: var(--color-brand-500);
      border: 1px solid var(--border-subtle);
    }
  `],
  template: `
    <div class="min-h-screen flex flex-col bg-page">

      <header class="sticky top-0 z-40 border-b bg-raised border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 h-14 flex items-center gap-3">
          <a routerLink="/" class="flex items-center gap-2">
            <div class="size-7 rounded-md bg-brand-500 grid place-items-center text-white text-sm font-bold">E</div>
            <span class="font-semibold text-[15px] tracking-tight">ETL Console</span>
          </a>
          <span class="text-sm text-[color:var(--text-muted)] hidden sm:inline">Setup guide</span>
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
            <a routerLink="/login" class="btn btn-primary btn-sm">Sign in</a>
          </div>
        </div>
      </header>

      <div class="mx-auto w-full max-w-6xl px-5 py-10 flex gap-10">

        <!-- Contents ------------------------------------------------------------- -->
        <nav class="hidden lg:block w-56 shrink-0" aria-label="Contents">
          <div class="sticky top-20">
            <p class="text-xs uppercase tracking-wider text-[color:var(--text-muted)] mb-3">
              On this page
            </p>
            <ul class="flex flex-col gap-1.5 text-sm">
              @for (s of sections; track s.id) {
                <li>
                  <a class="toc-link text-[color:var(--text-secondary)] hover:underline block"
                     [class.is-current]="current() === s.id" [href]="'#' + s.id">{{ s.title }}</a>
                </li>
              }
            </ul>
          </div>
        </nav>

        <!-- Body ----------------------------------------------------------------- -->
        <main class="doc min-w-0 flex-1 doc-body">
          <h1 class="text-3xl font-semibold tracking-tight">Setting up the console</h1>
          <p class="mt-3 text-[color:var(--text-secondary)] max-w-2xl">
            Work through these in order. Each step depends on the one before it — a job cannot
            run before a task exists, and a task cannot write anywhere before a storage
            connection does.
          </p>

          <div class="mt-6 card p-4 flex items-start gap-2.5">
            <app-icon name="info" class="icon-info mt-0.5 shrink-0" />
            <p class="text-sm text-[color:var(--text-secondary)]">
              Step 1 needs no account at all. Steps 2 to 4 need an administrator, and everything
              from step 5 onward can be done by any signed-in user in the tenant.
            </p>
          </div>

          @for (step of steps; track step.id; let i = $index) {
            <section class="mt-12">
              <h2 [id]="step.id" class="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                <span class="num">{{ i + 1 }}</span>
                {{ step.title }}
              </h2>
              <p class="mt-3 text-[color:var(--text-secondary)]">{{ step.intro }}</p>

              @if (step.where) {
                <p class="mt-3 text-sm">
                  <span class="text-[color:var(--text-muted)]">Where:</span>
                  <span class="mono ml-1.5">{{ step.where }}</span>
                </p>
              }

              @if (step.fields?.length) {
                <div class="mt-4 overflow-x-auto scroll-table">
                  <table class="table-modern">
                    <thead><tr><th>Field</th><th>What to put in it</th></tr></thead>
                    <tbody>
                      @for (f of step.fields; track f.name) {
                        <tr>
                          <td class="mono text-xs whitespace-nowrap align-top">
                            {{ f.name }}
                            @if (f.required) { <span class="text-crit-500" title="Required">*</span> }
                          </td>
                          <td class="text-sm">{{ f.note }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              @for (note of step.notes ?? []; track note) {
                <p class="mt-3 text-sm text-[color:var(--text-secondary)]">{{ note }}</p>
              }

              @if (step.shot) {
                <!-- Two files per shot, swapped by theme: a light screenshot on a dark page
                     reads as a hole in it. Lazy so the guide does not fetch eight images
                     before anyone scrolls. -->
                <figure class="mt-4">
                  <img class="doc-shot" loading="lazy" decoding="async"
                       [src]="shotFor(step.shot)"
                       [alt]="'The ' + step.title.toLowerCase() + ' screen'" />
                  @if (step.shotCaption) {
                    <figcaption class="field-note text-[color:var(--text-muted)] mt-2">
                      {{ step.shotCaption }}
                    </figcaption>
                  }
                </figure>
              }

              @if (step.warn) {
                <p class="mt-3 field-note text-crit-500 flex items-start gap-1.5" role="note">
                  <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                  <span>{{ step.warn }}</span>
                </p>
              }
            </section>
          }

          <!-- Reference ------------------------------------------------------------ -->
          <section class="mt-14">
            <h2 id="reference" class="text-xl font-semibold tracking-tight">Reference</h2>

            <h3 class="mt-6 text-sm font-semibold">Schedule frequencies</h3>
            <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
              The interval is how many of that unit to wait. Only these values are offered.
            </p>
            <div class="mt-3 overflow-x-auto scroll-table">
              <table class="table-modern">
                <thead><tr><th>Frequency</th><th>Means</th><th>Intervals</th></tr></thead>
                <tbody>
                  @for (f of frequencies; track f.name) {
                    <tr>
                      <td class="mono text-xs whitespace-nowrap">{{ f.name }}</td>
                      <td class="text-sm">{{ f.means }}</td>
                      <td class="mono text-xs">{{ f.intervals }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-sm text-[color:var(--text-secondary)]">
              Weekly can name particular weekdays, and Monthly a particular date. A day of
              <span class="mono">0</span> means the last day of the month, so February resolves
              to the 28th or 29th on its own.
            </p>

            <h3 class="mt-8 text-sm font-semibold">Roles</h3>
            <div class="mt-3 overflow-x-auto scroll-table">
              <table class="table-modern">
                <thead><tr><th>Role</th><th>Can reach</th></tr></thead>
                <tbody>
                  @for (r of roles; track r.name) {
                    <tr>
                      <td class="mono text-xs whitespace-nowrap">{{ r.name }}</td>
                      <td class="text-sm">{{ r.note }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-sm text-[color:var(--text-secondary)]">
              The roles nest: a platform administrator has everything a tenant administrator has,
              and a tenant administrator everything a tenant user has. The server enforces this
              regardless of what the interface shows.
            </p>

            <h3 class="mt-8 text-sm font-semibold">Run outcomes</h3>
            <div class="mt-3 overflow-x-auto scroll-table">
              <table class="table-modern">
                <thead><tr><th>Status</th><th>Means</th></tr></thead>
                <tbody>
                  @for (o of outcomes; track o.name) {
                    <tr>
                      <td class="mono text-xs whitespace-nowrap">{{ o.name }}</td>
                      <td class="text-sm">{{ o.note }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="mt-14 card p-6 flex flex-wrap items-center gap-5">
            <div class="min-w-0">
              <h2 class="text-base font-semibold">That is the whole setup</h2>
              <p class="mt-1 text-sm text-[color:var(--text-secondary)]">
                Sign in and work down the list. Each screen names what it needs.
              </p>
            </div>
            <a routerLink="/login" class="btn btn-primary ml-auto">
              Sign in<app-icon name="arrowRight" size="0.95em" />
            </a>
          </section>
        </main>
      </div>

      <footer class="mt-auto border-t border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 py-6 flex flex-wrap items-center gap-3">
          <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
          <a routerLink="/login" class="link-inline ml-auto text-sm">Sign in</a>
        </div>
      </footer>
    </div>
  `,
})
export class Docs implements AfterViewInit {
  readonly theme = inject(ThemeService);
  private readonly host = inject(ElementRef<HTMLElement>);
  // inject() only works in an injection context, so DestroyRef is taken here rather than
  // inside ngAfterViewInit, where the call would throw.
  private readonly destroyRef = inject(DestroyRef);
  readonly current = signal('');

  readonly steps: Step[] = [
    {
      id: 'request', title: 'Ask for a workspace',
      intro: 'If you do not have a workspace yet, request one. A platform administrator reviews '
           + 'every request; nothing is created until somebody agrees to it.',
      where: 'Request a workspace, from the front page — no sign-in needed',
      fields: [
        { name: 'Organisation', required: true, note: 'The name your workspace will carry.' },
        { name: 'Your name', required: true, note: 'Who the first administrator will be.' },
        { name: 'Your email', required: true, note: 'Where the sign-in details are sent, and your username.' },
        { name: 'Purpose', required: false, note: 'A sentence or two, for whoever reviews the request.' },
      ],
      notes: [
        'When a request is granted you are emailed a username and a password that works once. '
        + 'Sign in with it, and the console asks you to choose your own password straight away — '
        + 'the emailed one stops working at that moment. You can change it again any time from '
        + 'your profile.',
        'The form answers the same way whether or not the address is already known, so it cannot '
        + 'be used to find out who has an account here. If you already have one, sign in instead.',
      ],
      warn: 'If a welcome email never arrives, ask a platform administrator to reset the password '
          + 'rather than requesting a second workspace — the account already exists by then.',
    },
    {
      id: 'tenant', title: 'Create the tenant and its people',
      intro: 'A tenant is the boundary everything else sits inside. Jobs, tasks, buckets and '
           + 'users all belong to one, and nothing crosses between them.',
      where: 'Administration → Tenants, then Administration → Users',
      fields: [
        { name: 'Tenant name', required: true, note: 'How the company appears throughout the console.' },
        { name: 'Tenant code', required: true, note: 'A short unique key. It cannot clash with another tenant.' },
        { name: 'Full name', required: true, note: 'The person’s name, shown beside their avatar.' },
        { name: 'Email', required: true, note: 'Used to sign in, so it has to be unique across the whole install.' },
        { name: 'Position', required: false, note: 'Their job title. Separate from Role — a lead and an engineer can share a role.' },
        { name: 'Role', required: true, note: 'What they may reach. See the reference below.' },
      ],
      notes: ['Give each tenant at least two administrators, so nobody is locked out when one is away.'],
    },
    {
      id: 'storage', title: 'Connect the storage',
      intro: 'A connection tells the console where a job may read from and write to. Add one '
           + 'before creating tasks, because a task names the bucket it writes into.',
      where: 'Configuration → Storage Connections',
      fields: [
        { name: 'Provider', required: true, note: 'MinIO, S3, Azure, FTP or FTPS.' },
        { name: 'Connection name', required: true, note: 'How it appears when a task picks a destination.' },
        { name: 'Bucket', required: true, note: 'For the object stores. FTP has no bucket, so it uses a base directory instead.' },
        { name: 'Endpoint', required: true, note: 'The address of the service. Not needed for AWS S3 itself.' },
        { name: 'Credentials', required: true, note: 'Access key and secret, or the FTP username and password.' },
      ],
      notes: ['Use Test connection before saving. A connection that has never been tested still '
            + 'saves, and the first thing that notices is a failed job.'],
      warn: 'Give each tenant its own bucket. Sharing one means a job in one tenant writes where '
          + 'another tenant reads, and the console will refuse to serve those objects across the boundary.',
    },
    {
      id: 'task-type', title: 'Register the task type',
      intro: 'A task type names the downstream consumer that does the work and the Kafka topic '
           + 'that reaches it. Many tasks can share a type.',
      where: 'Configuration → Source Task Types',
      fields: [
        { name: 'Service name', required: true, note: 'The consumer, as you refer to it. For example ETL Scrapping Pipeline.' },
        { name: 'Topic', required: true, note: 'Letters and hyphens only. Digits, dots and underscores are rejected.' },
        { name: 'Partition', required: false, note: '* for every partition, or one index from 0 to 10. A comma-separated list is not supported.' },
        { name: 'Kafka connection', required: false, note: 'Leave unset to publish to the tenant’s default cluster.' },
      ],
      notes: ['Kafka routing is a per-tenant override, so it is set by a tenant administrator. '
            + 'A platform administrator publishes unscoped.'],
    },
    {
      id: 'task', title: 'Describe the task',
      intro: 'A task is the unit of work: what to fetch or process, where it reads from and '
           + 'where it writes. It carries no timetable — that comes next.',
      where: 'Pipelines → Source Tasks → New task',
      fields: [
        { name: 'Task name', required: true, note: 'Name it for the work, not the schedule. One task often feeds several jobs.' },
        { name: 'Task type', required: true, note: 'The consumer registered in the previous step.' },
        { name: 'Pipeline', required: false, note: 'The pipelineId the worker routes on. It decides which handler runs.' },
        { name: 'Bucket', required: false, note: 'Where output lands. This is the connection added in step 2.' },
        { name: 'Payload', required: true, note: 'The configuration the worker receives, as XML tags.' },
      ],
      notes: ['You do not have to write the XML by hand. Tools → XML Configuration builds it '
            + 'from tag rows, and a dynamic form submission can be turned into a payload directly.'],
    },
    {
      id: 'job', title: 'Put the task on a timetable',
      intro: 'A job binds a task to a schedule. The same task can carry several jobs — one '
           + 'hourly, one at month end — without being described twice.',
      where: 'Pipelines → Source Jobs → New job',
      fields: [
        { name: 'Job name', required: true, note: 'Name it for when it runs, since that is what distinguishes it from its siblings.' },
        { name: 'Task', required: true, note: 'The task from step 4.' },
        { name: 'Execution', required: true, note: 'Auto follows the schedule. Manual runs only when someone starts it.' },
        { name: 'Priority', required: false, note: '1 to 9, or 99 and 100.' },
        { name: 'Assigned to', required: false, note: 'Who hears about it. Defaults to whoever created the job.' },
        { name: 'Frequency and interval', required: true, note: 'See the reference below.' },
        { name: 'Start date and time', required: true, note: 'When the timetable begins. It does not have to be the first run.' },
        { name: 'End date', required: false, note: 'The schedule expires after this date and stops on its own.' },
      ],
      notes: ['The start date says when a schedule begins, not which days it runs. A Mon/Thu '
            + 'schedule created on a Tuesday takes its first run that Thursday.'],
    },
    {
      id: 'watch', title: 'Watch it run',
      intro: 'Once a job is due the scheduler queues it, a worker picks it up, and the console '
           + 'follows it from there.',
      where: 'Pipelines → Source Jobs, and Pipelines → Q-Message',
      notes: [
        'Run now starts a job immediately without disturbing its timetable. Skip next run drops '
        + 'the next slot and leaves the rest in place.',
        'Each run keeps its own log. Open a run from the job’s history to read it, live while it '
        + 'is going and afterwards.',
        'A run missed while the system was down is recorded as Missed rather than passed over, so '
        + 'a gap in the history is visible rather than silent.',
      ],
    },
    {
      id: 'report', title: 'Report on what happened',
      intro: 'Runs roll up into a report you can group and measure, then take away.',
      where: 'Reports',
      notes: [
        'Group by task, outcome or day, choose a measure, and the table and chart follow.',
        'Export as CSV or XLSX — either to your machine or straight into one of the buckets from '
        + 'step 2.',
      ],
    },
    {
      id: 'optional', title: 'The optional pieces',
      intro: 'None of these are needed to run a pipeline, but each removes work once you are '
           + 'past the basics.',
      notes: [
        'Query Engine — register a database, save a SQL query, preview it, and have it run to a '
        + 'bucket on a schedule of its own.',
        'Dynamic Forms — build a form, share its link, and turn what comes back into a task’s '
        + 'configuration instead of hand-writing XML.',
        'Task Forms — describe what a pipeline expects once, so its tasks are filled in field by '
        + 'field rather than as raw tags.',
        'Lookups — shared key and value data the forms and pipelines read from.',
      ],
    },
  ];

  readonly sections: Section[] = [
    ...this.steps.map(s => ({ id: s.id, title: s.title })),
    { id: 'reference', title: 'Reference' },
  ];

  readonly frequencies = [
    { name: 'Mint', means: 'Every so many minutes', intervals: '5, 10, 15 … 55' },
    { name: 'Hr', means: 'Every so many hours', intervals: '1 – 12' },
    { name: 'Daily', means: 'Every so many days', intervals: '1 – 6' },
    { name: 'Weekly', means: 'Every so many weeks, or on named weekdays', intervals: '1 – 4' },
    { name: 'Monthly', means: 'Every so many months, or on a date each month', intervals: '1 – 6' },
  ];

  readonly roles = [
    { name: 'PLATFORM_ADMIN', note: 'Every tenant, the settings that apply across all of them, and the workspace requests waiting for a decision.' },
    { name: 'TENANT_ADMIN', note: 'Everything inside one tenant, including its users, connections and forms.' },
    { name: 'TENANT_USER', note: 'The pipelines: tasks, jobs, runs, logs and reports within their tenant.' },
  ];

  readonly outcomes = [
    { name: 'Queue', note: 'Due and handed to the workers; not started yet.' },
    { name: 'Start / Running', note: 'A worker has it and is reporting progress.' },
    { name: 'Completed', note: 'Finished, and whatever it produced has been written.' },
    { name: 'Failed', note: 'Stopped with a reason. The run’s log says what happened.' },
    { name: 'Skip', note: 'Passed over deliberately — by a person, or because the job was already queued.' },
    { name: 'Missed', note: 'Its slot went by while nothing was running to take it.' },
  ];

  /** Screenshots come in a light and a dark file; the viewer's theme picks which. */
  shotFor(name: string): string {
    return `/docs/${name}-${this.theme.theme()}.png`;
  }

  /**
   * Marks the section being read.
   *
   * Done on scroll rather than with an IntersectionObserver: a heading jumped to lands at its
   * scroll-margin, which sat exactly on the observer band's edge, so it was as likely to be
   * counted above the band as inside it and the highlight lagged a section behind. Asking which
   * heading has most recently passed the top is the same question with one answer.
   */
  ngAfterViewInit(): void {
    const headings = Array.from(
      (this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('h2[id]'));
    if (!headings.length) return;

    const update = () => {
      let reading = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > 100) break;
        reading = heading.id;
      }
      this.current.set(reading);
    };

    window.addEventListener('scroll', update, { passive: true });
    this.destroyRef.onDestroy(() => window.removeEventListener('scroll', update));
    update();
  }
}
