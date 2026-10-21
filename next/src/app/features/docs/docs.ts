import { AfterViewInit, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { ThemeService } from '../../core/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { NAV, NavGate, NavTab } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';

interface Section { id: string; title: string; }

interface StepField { name: string; required: boolean; note: string; }

/** A place in the console: where the menu shows it ("Run & review › Review"), and its address. */
interface Place { label: string; path: string; }

interface Step {
  id: string;
  title: string;
  intro: string;
  /** Where it is done, as links into the console. */
  where?: Place[];
  /** What to do, in order. */
  todo?: string[];
  fields?: StepField[];
  notes?: string[];
  warn?: string;
}

/** The menu as a map (Reference): every group, its entries and, for a hub, its tabs -- read from the menu's own tree. */
interface MapRow { group: string; entry: string; path: string; tabs: string; gate: NavGate & { tabs?: NavTab[] }; }

/**
 * Who a role-only entry is for, or null for an entry any role may have: Platform's tabs are all the platform
 * administrators', Billing's Settings tab theirs too, Administration's Users a workspace administrator's.
 */
export function roleOnly(gate: NavGate & { tabs?: NavTab[] }): 'platform administrators' | 'workspace administrators' | null {
  const tabs = gate.tabs ?? [];
  if (gate.platformOnly || (tabs.length && tabs.every(t => t.platformOnly))) return 'platform administrators';
  if (gate.adminOnly || (tabs.length && tabs.every(t => t.adminOnly || t.platformOnly))) return 'workspace administrators';
  return null;
}

/**
 * The in-app guide (owner 2026-10-13: rewritten for the current product).
 *
 * Public, like the landing page, so it can be linked to and read before signing in -- it
 * describes the console's own screens and carries nothing tenant-specific. Task-oriented and
 * in the menu's order: get data in, build, run and schedule, review (the Review home), results,
 * monitoring, people and billing, with links into the console. The menu map in the reference is
 * read from the menu's own tree (core/nav/nav-tree.ts), so it cannot name a menu that is gone.
 *
 * Healthcare-safe: every example is synthetic, and the guide never claims the console makes a
 * workspace compliant with a law or standard. The frequencies and intervals come from
 * ProcessTimeUtil; if those change, this page is wrong and should be changed with it.
 */
@Component({
  selector: 'app-docs',
  imports: [RouterLink, Icon, BrandMark],
  styles: [`
    :host { display: block; }
    .doc h2 { scroll-margin-top: 5rem; }
    .doc-body p { line-height: 1.7; }
    .toc-link.is-current { color: var(--accent-text); font-weight: 600; }
    .num {
      display: grid; place-items: center; flex: none;
      width: 1.6rem; height: 1.6rem; border-radius: 999px;
      font-size: .75rem; font-weight: 600;
      background: var(--surface-inset); color: var(--accent-text);
      border: 1px solid var(--border-subtle);
    }
  `],
  template: `
    <div class="min-h-screen flex flex-col bg-page">

      <header class="sticky top-0 z-40 border-b bg-raised border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 h-14 flex items-center gap-3">
          <a routerLink="/">
            <app-brand-mark />
          </a>
          <span class="text-sm text-[color:var(--text-muted)] hidden sm:inline">Guide</span>
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
            <!-- The guide is linked from the console's account menu, so a reader may well be signed
                 in already; telling them to sign in again was wrong. -->
            @if (auth.isLoggedIn()) {
              <a routerLink="/dashboard" class="btn btn-primary btn-sm">Back to console</a>
            } @else {
              <a routerLink="/login" class="btn btn-primary btn-sm">Sign in</a>
            }
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
                     [class.is-current]="current() === s.id"
                     [attr.aria-current]="current() === s.id ? 'location' : null"
                     [href]="'#' + s.id" (click)="jump($event, s.id)">{{ s.title }}</a>
                </li>
              }
            </ul>
          </div>
        </nav>

        <!-- Body ----------------------------------------------------------------- -->
        <main class="doc min-w-0 flex-1 doc-body">
          <h1 class="text-3xl font-semibold tracking-tight">Using the console</h1>
          <p class="mt-3 text-[color:var(--text-secondary)] max-w-2xl">
            The main flow, in the menu's order: get data in, build a pipeline, run and schedule it, review what
            it made, and read the results — then the monitoring, the people and the bill around it. Each part
            says where it is done; the links open that page in the console.
          </p>

          <!-- The side contents only fit from lg up; below that the same list folds away here. -->
          <details #tocSmall class="lg:hidden mt-6 card p-4">
            <summary class="text-sm font-medium cursor-pointer">On this page</summary>
            <ul class="mt-3 flex flex-col gap-1.5 text-sm">
              @for (s of sections; track s.id) {
                <li>
                  <a class="text-[color:var(--text-secondary)] hover:underline"
                     [href]="'#' + s.id" (click)="jump($event, s.id); tocSmall.open = false">{{ s.title }}</a>
                </li>
              }
            </ul>
          </details>

          <div class="mt-6 card p-4 flex items-start gap-2.5">
            <app-icon name="info" class="icon-info mt-0.5 shrink-0" />
            <p class="text-sm text-[color:var(--text-secondary)]">
              Asking for a workspace needs no account. Adding people, connections, settings and pipelines needs a
              workspace administrator; running, reviewing and reading results is for any member whose page access
              includes the page. The examples here are made up — use synthetic or de-identified records while you
              set things up and try them.
            </p>
          </div>

          @for (step of steps; track step.id; let i = $index) {
            <section class="mt-12">
              <h2 [id]="step.id" class="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                <span class="num">{{ i + 1 }}</span>
                {{ step.title }}
              </h2>
              <p class="mt-3 text-[color:var(--text-secondary)]">{{ step.intro }}</p>

              @if (step.where?.length) {
                <p class="mt-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1" data-test="doc-where">
                  <span class="text-[color:var(--text-muted)]">Where:</span>
                  @for (w of step.where; track w.path) {
                    <a class="link-inline" [routerLink]="w.path">{{ w.label }}</a>
                  }
                </p>
              }

              @if (step.todo?.length) {
                <ol class="mt-4 flex flex-col gap-2 text-sm list-decimal pl-5">
                  @for (t of step.todo; track t) { <li class="pl-1">{{ t }}</li> }
                </ol>
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

              @if (step.warn) {
                <p class="mt-3 field-note text-warn-500 flex items-start gap-1.5" role="note">
                  <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                  <span>{{ step.warn }}</span>
                </p>
              }
            </section>
          }

          <!-- Reference ------------------------------------------------------------ -->
          <section class="mt-14">
            <h2 id="reference" class="text-xl font-semibold tracking-tight">Reference</h2>

            <h3 class="mt-6 text-sm font-semibold">The menu</h3>
            <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
              Grouped by the work being done. An entry with tabs is one page with a tab per part; you see the
              entries and tabs your role and page access open, and a tab you may not open is not shown.
            </p>
            <div class="mt-3 overflow-x-auto scroll-table">
              <table class="table-modern" data-test="doc-menu">
                <thead><tr><th>Group</th><th>Entry</th><th>Tabs</th></tr></thead>
                <tbody>
                  @for (m of menu; track m.path) {
                    <tr>
                      <td class="text-sm whitespace-nowrap text-[color:var(--text-secondary)]">{{ m.group }}</td>
                      <td class="text-sm whitespace-nowrap">
                        @if (linked(m)) {
                          <a class="link-inline" [routerLink]="m.path">{{ m.entry }}</a>
                        } @else {
                          <span data-test="doc-menu-unlinked">{{ m.entry }}</span>
                          <span class="ml-1 text-xs text-[color:var(--text-muted)]">({{ notLinkedWhy(m) }})</span>
                        }
                      </td>
                      <td class="text-sm">{{ m.tabs || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <h3 class="mt-8 text-sm font-semibold">Schedule frequencies</h3>
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
              The roles nest: a platform administrator has everything a workspace administrator has,
              and a workspace administrator everything a workspace member has. Page access then narrows a
              member to the pages their profile names. The server enforces both, whatever the screen shows.
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
              <h2 class="text-base font-semibold">Ready to start</h2>
              <p class="mt-1 text-sm text-[color:var(--text-secondary)]">
                {{ auth.isLoggedIn() ? 'Open the console and follow the flow above.' : 'Sign in and follow the flow above.' }}
                Each screen says what it needs.
              </p>
            </div>
            @if (auth.isLoggedIn()) {
              <a routerLink="/dashboard" class="btn btn-primary ml-auto">
                Back to console<app-icon name="arrowRight" size="0.95em" />
              </a>
            } @else {
              <a routerLink="/login" class="btn btn-primary ml-auto">
                Sign in<app-icon name="arrowRight" size="0.95em" />
              </a>
            }
          </section>
        </main>
      </div>

      <footer class="mt-auto border-t border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 py-6 flex flex-wrap items-center gap-3">
          <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
          @if (auth.isLoggedIn()) {
            <a routerLink="/dashboard" class="link-inline ml-auto text-sm">Back to console</a>
          } @else {
            <a routerLink="/login" class="link-inline ml-auto text-sm">Sign in</a>
          }
        </div>
      </footer>
    </div>
  `,
})
export class Docs implements AfterViewInit {
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  // inject() only works in an injection context, so DestroyRef is taken here rather than
  // inside ngAfterViewInit, where the call would throw.
  private readonly destroyRef = inject(DestroyRef);
  readonly current = signal('');

  readonly steps: Step[] = [
    {
      id: 'start', title: 'Get a workspace and sign in',
      intro: 'A workspace holds everything else — its people, connections, pipelines, runs and bills — and nothing crosses '
           + 'between workspaces. A platform administrator reviews each request; nothing is created until someone agrees.',
      where: [{ label: 'Request a workspace', path: '/request-workspace' }, { label: 'Account › My security', path: '/account/security' }],
      todo: [
        'Ask for a workspace from the front page: your organisation, your name and your email. No sign-in is needed.',
        'When it is granted you receive a username and a password that works once. Sign in, and choose your own password straight away.',
        'Turn on two-factor sign-in under Account › My security, and pick your theme from the top bar.',
      ],
      notes: ['The request form answers the same way whether or not an address is already known, so it cannot be used to find out who has an account.'],
      warn: 'If a welcome email never arrives, ask a platform administrator to reset the password rather than requesting a second workspace.',
    },
    {
      id: 'people', title: 'Add people and decide what they open',
      intro: 'A role says how much someone may do; page access says which pages a member sees at all. Both are a workspace '
           + 'administrator\'s, under Administration.',
      where: [
        { label: 'Administration › Users', path: '/administration/users' },
        { label: 'Administration › Page access', path: '/administration/access-profiles' },
        { label: 'Administration › Sign-in security', path: '/administration/security' },
      ],
      todo: [
        'Add each person with their name, email and role: Workspace member or Workspace administrator.',
        'Make page-access profiles for the work people do — for example a Reviewer who opens Review and the Runs, and a Viewer who reads Dashboards only — and give each member one.',
        'Set the workspace\'s sign-in rules: password length, lockout, idle sign-out, two-factor and single sign-on.',
      ],
      notes: [
        'Give the workspace at least two administrators, so nobody is locked out when one is away.',
        'A page a profile leaves out leaves the menu; its address shows a page that says so and offers to ask for access. The server refuses the calls behind it whatever the browser shows.',
      ],
    },
    {
      id: 'data-in', title: 'Get data in',
      intro: 'Pipelines read from connections, documents and forms. Set up the ones you need before building a pipeline that uses them.',
      where: [
        { label: 'Get data in › Connections', path: '/connections' },
        { label: 'Get data in › Documents', path: '/documents' },
        { label: 'Get data in › Forms', path: '/forms' },
      ],
      todo: [
        'Connections: add storage (S3, Azure, MinIO, FTP), databases, API collections and connectors. Test each one before you save it.',
        'Sources and Data contracts: name what a pipeline reads, and the columns and rules it must meet.',
        'Documents: on Document types, add the types you read from the starters, grouped by market, or define your own with the fields to read.',
        'Then send documents in on Documents › Intake: Upload, or mail them to the workspace\'s Email-in address. File drop, on the same tab, stores files that start pipelines.',
        'An approved document\'s values land in Documents › Approved data. Document types says what each type\'s approval starts; set it on a schedule.',
        'Forms: build a form whose answers start a pipeline or feed a review.',
      ],
      notes: [
        'Values a document type is unsure of go to Review › Documents for a person to check.',
        'A form that keeps its answers as a dataset writes a file per submission to your bucket. If those files are lost or '
          + 'were written by an older version, an administrator can choose Rebuild dataset files in the form\'s row menu (⋮): '
          + 'each file is written again from the submission as it is kept, and no answer changes.',
      ],
      warn: 'Give each workspace its own bucket. A shared bucket lets one workspace\'s runs write where another reads.',
    },
    {
      id: 'build', title: 'Build a pipeline',
      intro: 'A pipeline is what a run does: the steps that read, transform, ask a model, check and write. Start from a '
           + 'description in plain language, from steps, or from a copy of an existing pipeline.',
      where: [
        { label: 'Build › Pipelines › New pipeline', path: '/pipelines/new' },
        { label: 'Build › AI Assistant', path: '/ai/assistant' },
        { label: 'Build › Pipelines › Prompts', path: '/pipelines/prompts' },
        { label: 'Build › Approval workflows', path: '/workflows/designer' },
      ],
      todo: [
        'Describe it to the AI Assistant ("read the orders file each night, flag amounts over 10,000, write a summary"), check the steps it proposes, and save; or add the steps yourself.',
        'Steps are grouped by stage: read, check, transform, AI, review and write. Show them as a List or as a Flow; in the Flow '
          + 'view a long pipeline folds each stage into one node with its stage button, or all at once with Collapse all and Expand all.',
        'For an AI step, pick a prompt (Prompts) and the model connection it runs on (Settings › Model connections).',
        'To make a finished report, add a Generate report step and choose where its design comes from: Design the report here '
          + '(the designer opens on the step\'s own data from the pipeline\'s latest run; publish the design for the step to run it) '
          + 'or Use a saved template. Each run keeps the report\'s PDF with its outputs and adds a version to Reports › Library.',
        'To work on files rather than rows, add a Transcribe audio step (each recording\'s text, its language and length; with '
          + 'Timestamps, each stretch of speech with its start and end) or a Convert file step (each file in another format — '
          + 'pdf, docx, xlsx, csv, png and more — written to a bucket or kept with the run). Both read the files the run was '
          + 'started for, or those a File key column names; When a file fails says whether the step stops, skips that file or keeps it with the reason.',
        'Save File and Upload to bucket write all the rows as one file; with One file per row they write a file for each row '
          + '— a folder of recordings, one insight file each — named from the row\'s columns, as in {{file_stem}}-insight.json. '
          + 'JSON columns are written as lists and objects rather than as text; Generate report reads its JSON columns the same way.',
        'On a schedule, set Read S3\'s Which objects to last_run: each run reads only the files written since the schedule\'s last '
          + 'completed run (a failed run moves nothing, so its files come again). Turn on The run\'s own files first and the same '
          + 'pipeline also takes a file that arrives in the inbox. Generate report with One report per row makes a report for each '
          + 'row — one per recording — each its own report in Reports › Library, named from the row, as in Call · {{file_name}}.',
        'In the pipeline\'s Settings, choose whether its results wait for a review, and whether that review may be decided in bulk or only one by one.',
        'For a sign-off in the middle of a run, add an Approval step and say who approves it in Approval workflows.',
      ],
      notes: [
        'Data policies (Administration › Data policies) decide which models may see each level of data and how long a run keeps it.',
        'A pipeline belongs to one workspace. A platform administrator opens the workspace first, with Work in this workspace on '
          + 'Platform › Workspaces, before New pipeline offers anything.',
      ],
    },
    {
      id: 'run', title: 'Run and schedule it',
      intro: 'A schedule runs a pipeline on a timetable or when something arrives; Run now runs it at once.',
      where: [
        { label: 'Build › Pipelines › Schedules & triggers', path: '/pipelines/schedules' },
        { label: 'Run & review › Runs', path: '/runs' },
      ],
      todo: [
        'Add a schedule: the pipeline, a frequency (see the reference below), a start, and optionally an end, retries and who hears about it.',
        'Or a trigger: a file dropped, an email in, a document approved, a form submitted.',
        'Follow runs under Runs: Latest, By date, Analytics, Failed and Backfills. A run\'s page has the tabs Steps, Map, AI answers, Outputs and Log.',
        'On Outputs, View shows a file in place: a kept PDF in the PDF viewer, a kept table as a table, a file the run put in a bucket in the file preview. Download takes it away.',
        'Retry a failed run from the step that failed (Runs › Failed groups failures by their error), or run a schedule for each period of a past range (Backfills).',
      ],
      notes: ['A run missed while the system was down is recorded as Missed, and a run stopped before it finished as Interrupted, so a gap in the history is never silent.'],
    },
    {
      id: 'review', title: 'Review and approve',
      intro: 'Everything waiting for a person is in one place, Review, with one count on the menu and on Home: approvals, '
           + 'runs whose results wait for review, and documents with values to check.',
      where: [
        { label: 'Run & review › Review', path: '/review' },
        { label: 'Review › Approvals', path: '/review/approvals' },
        { label: 'Review › Runs', path: '/review/runs' },
        { label: 'Review › Documents', path: '/review/documents' },
      ],
      todo: [
        'Open All waiting: overdue items first, then the longest waiting. Narrow it by kind, by who it waits on, or by a search.',
        'Click a row to read it in the side panel; approve or reject it there, or open its own page.',
        'To decide several at once, tick them and choose Approve or Reject. You first see what will happen to each, then add a comment (required to reject) and confirm; the answer lists every item.',
        'Each tab — Approvals, Runs, Documents — is that kind\'s own list with its own filters.',
      ],
      notes: [
        'A run\'s review shows what is being reviewed, from the result the pipeline kept for it: the image a field names, the '
          + 'first fields a reviewer looks at (with a DRAFT mark where the pipeline marks a model\'s answer as a draft), the rest on '
          + 'demand, the run\'s PDF and Open the run. A model\'s answer is a draft for a person to check, never a decision.',
        'A pipeline set to individual review is never decided in bulk, and a document someone has claimed is theirs to decide.',
        'Whether runs and documents may be approved in bulk at all is the workspace\'s choice, under Administration › Data policies.',
      ],
    },
    {
      id: 'results', title: 'Read the results',
      intro: 'What pipelines produce lands in boards, in questions you can ask, and in files.',
      where: [
        { label: 'See results › Dashboards', path: '/data/analytics/dashboards' },
        { label: 'See results › Analysis', path: '/data' },
        { label: 'See results › Reports', path: '/reports/library' },
      ],
      todo: [
        'Dashboards: boards of tiles over your pipelines\' results; each board names the pipelines that feed it.',
        'Ask your data: ask a question in plain words and read the answer with the rows behind it; pin it to a dashboard.',
        'Analytics Studio and the Data Catalog: explore datasets, and find what was made from what.',
        'Files: the files runs wrote and the uploads, by connection and folder, each with a preview.',
        'Reports: finished PDF and HTML reports made from a template with your data, approved and signed by a person; the next part says how.',
      ],
    },
    {
      id: 'reports', title: 'Make signed reports',
      intro: 'Reports turns data into a finished report from a template designed once: filled from a pipeline\'s run, a dataset or '
           + 'a file, every version kept, and approved and digitally signed by someone other than whoever generated it.',
      where: [
        { label: 'See results › Reports › Overview', path: '/reports/overview' },
        { label: 'Reports › Templates', path: '/reports/templates' },
        { label: 'Reports › Library', path: '/reports/library' },
        { label: 'Reports › Data', path: '/reports/data' },
        { label: 'Reports › Assets & branding', path: '/reports/assets' },
        { label: 'Reports › Settings (administrators)', path: '/reports/settings' },
      ],
      todo: [
        'Assets & branding: upload logos and images, and make a brand profile so every report has the same header, footer, '
          + 'colours and logo. Signatures and stamps are uploaded by one person and approved by another before anyone may place them.',
        'Templates › New template makes a draft you lay out in the designer: text, fields, tables with totals, pictures from the data, charts, '
          + 'KPI tiles and QR codes; show a block only when a condition holds, or repeat it for each item of a list; add a '
          + 'watermark (DRAFT, COPY, CONFIDENTIAL, VOID, SAMPLE or your own words), a page tint or a letterhead. Try it with test '
          + 'data, then publish it.',
        'Create report: pick a published template, the data (a run\'s output, a saved source, a file, or several files as one) '
          + 'and how its fields map, read the checks and the preview, and generate. Every generate is a new version; nothing is overwritten.',
        'From a pipeline: a Generate report step makes a version on every run, with a design made inside the step or a saved '
          + 'template (see Build a pipeline).',
        'A report\'s page in the Library lists its versions. Someone allowed to approve, who did not generate that version, '
          + 'chooses Approve and sign: the PDF gets a digital signature in their name. Only the current version can be approved; '
          + 'an older one that was never approved reads Superseded.',
        'Verify signature checks a version\'s PDF, or a file someone sent you, against the workspace\'s approved reports.',
        'Ask for approval on a report\'s page (or tick Ask for approval when it is ready when you generate) and the version waits in the '
          + 'reviewers\' Review › Approvals, which shows the first page and the next ones beside Approve and sign and Reject, which needs a reason '
          + 'the person who asked reads. Approving there signs the PDF just as on the report\'s page. A newer version replaces the request.',
        'Templates › Ask for approval in the designer waits for the publishers in Review › Approvals: they publish the draft there, or send it '
          + 'back saying why. A signature or stamp waiting for approval waits there too.',
      ],
      notes: [
        'Mark this version as COPY when you generate it, or let a template say Every download after the first says COPY.',
        'A version you no longer stand behind is marked Void with a reason: it stays, and every copy served from then on says VOID. '
          + 'The approved file itself is never changed, so its signature still verifies.',
        'Archive takes a report out of the library and keeps it. Delete removes a report and its versions for good, and only while '
          + 'no version of it was approved: an approved report is a kept record, so void the version or archive the report. Stored files '
          + 'that storage does not remove stay until an operator removes them; the message after a delete says so.',
        'You can delete several reports at once in the Library: tick them, then Delete. Approved ones cannot be ticked.',
        'The Library, Templates and Assets lists page and search on the server, so a large library opens as quickly as a small one.',
        'Reports › Settings (workspace administrators): who approves reports and signatures, and who publishes templates (the access '
          + 'profile that may, worked out for you, or one you choose); Ask for approval of every new version; Two approvals, where a second '
          + 'person approves after the first and the signature names both; and Publishing needs a second person. All are off at first.',
        'Retention (Administration › Data policies) has a class Reports: the files of versions a newer one replaced, and the frozen data no '
          + 'kept version uses, after the days you set. Each report\'s current version, every approved or signed version and a version waiting '
          + 'for approval always stay; a removed version keeps its record and says Removed by retention. Reports › Settings previews what would go.',
        'Generating is limited to 30 a minute a person, and previews to 30 (the designer\'s live page to 120); past that you are asked to '
          + 'wait a few seconds.',
        'Most pages in one report (Reports › Settings › Report size): each workspace\'s own, 300 unless its administrators set fewer. '
          + 'Every page counts, a long table\'s too, in Create report, a preview and a pipeline\'s Generate report step. Only the platform '
          + 'administrator can let a workspace go past 300, up to the platform\'s hard maximum. A report over the limit is not made: the '
          + 'message names the limit and who can raise it, and the failed job and the report\'s page offer what applies: Make one report '
          + 'per row (a pipeline step\'s settings), Lower the table\'s rows (the template in the designer), Export the data as CSV (a '
          + 'run\'s data), and Raise the limit for a workspace administrator.',
        'In a template\'s designer (and a pipeline step\'s own design) the AI assistant, in the right pane, drafts a template from '
          + 'plain words, suggests field mappings (with how sure it is) and charts for your test data, explains the checks\' problems '
          + 'and writes a paragraph of the data\'s own values, labelled "Drafted with AI". Each is a proposal: shown as a list of '
          + 'changes and on the page, applied only when you accept it (Undo takes it back), and refused once the draft was saved '
          + 'since. Only the test data\'s field names and types are sent unless you tick sample values; it uses your workspace\'s '
          + 'model connection, and its calls count as AI usage in Cost & usage.',
      ],
      warn: 'An approval is a person\'s decision about what they have read. The signature proves who approved which file and that it '
          + 'has not changed since, not that its content is right.',
    },
    {
      id: 'monitor', title: 'Monitor and get alerted',
      intro: 'Be told when something needs attention instead of watching for it.',
      where: [
        { label: 'Administration & billing › Settings › Alerts', path: '/settings/alerts' },
        { label: 'Run & review › Runs › Failed', path: '/runs/failed' },
        { label: 'Notifications', path: '/notifications' },
      ],
      todo: [
        'Add alert rules for failed runs, missed schedules, slow runs and reviews waiting too long, sent to the bell, by mail or to your webhooks.',
        'Read failures grouped by error pattern under Runs › Failed, and retry them from there.',
        'The bell in the top bar holds every notification; Notifications is the whole list.',
      ],
      notes: ['A platform administrator also reads Platform › Service health: each service\'s health, its deploys in the last 24 '
        + 'hours, and the Background checks (Kafka consumers and the billing reconciliation): each one\'s result, what it found and when it was read.'],
    },
    {
      id: 'billing', title: 'See what it costs',
      intro: 'Everything a workspace uses is metered as it happens and priced from a rate card; Cost & usage shows the month as the invoice will read it.',
      where: [
        { label: 'Administration & billing › Billing', path: '/billing' },
      ],
      todo: [
        'Cost & usage: month to date and a forecast at the last week\'s pace; Cost by day (daily or cumulative); Cost by pipeline, '
          + 'with By pipeline and, for the pipeline you pick, By run; AI model calls by source or every call; By service; and Line by '
          + 'line, what is behind each charge. A run\'s own page links to what it cost.',
        'Invoices: each closed month, its lines frozen with the rate card that priced them, with payment slips, credit notes and a PDF.',
        'Billing documents: every bill, slip and statement in one place.',
      ],
      fields: [
        { name: 'What is metered', required: false, note: 'Storage kept (measured nightly), bytes written, read and deleted, storage operations, pipeline runs and their minutes, model tokens, images described, documents converted, analytics queries, API calls and seats.' },
        { name: 'Rate cards', required: false, note: 'Kept as versions by a platform administrator on Billing › Settings. A change is a new version with an effective date; a bill already drafted or issued keeps the version it names.' },
        { name: 'Pricing rules', required: false, note: 'A rate card version may price some usage differently: a rule for one pipeline, then for a pipeline tag, then for a data class, else the card\'s own price. A rule changes only the unit price. Drafts are previewed against last month or this month so far before they are published.' },
      ],
    },
    {
      id: 'developers', title: 'Connect your own systems',
      intro: 'Your own systems use the customer API (/v1): start runs, send files and events, read what runs made, and be told by '
           + 'webhooks. Its documentation, with samples to copy, is the Developer portal.',
      where: [
        { label: 'Administration & billing › Developers › API Clients', path: '/developers/api-clients' },
        { label: 'Developers › Developer portal', path: '/developers/portal' },
      ],
      todo: [
        'API Clients: a workspace administrator makes one client for each system, with only the scopes it needs. Its secret is shown once. Webhooks and event routes are set up on the same page.',
        'Sandbox: once your account team has made one, make test keys under API Clients › Sandbox. They work only in the sandbox, and nothing there is billed.',
        'Developer portal: guides with samples in curl, Python and Node.js, the API reference, the event and problem types, the rate limits, the changelog, and the OpenAPI document and a Postman collection to download.',
        'Your API clients, in the portal, shows what each client may call; APIs this workspace calls lists the saved requests your pipelines send out, and what each last answered.',
      ],
      notes: [
        'A report a pipeline\'s Generate report step made is listed in the run\'s outputs, and webhooks are told when it is there. '
          + 'Approving, signing and verifying reports are done in Reports; the API has no calls for the Reports library yet.',
        'By default each client may make 600 calls a minute (bursts of 100), and all of a workspace\'s clients together 1,200 (bursts of 200), unless the platform sets other limits.',
        'A platform administrator has no workspace of their own: API Clients, Your API clients and APIs this workspace calls ask which workspace first, and every change is made in the one picked.',
      ],
    },
    {
      id: 'health-data', title: 'Working with health data',
      intro: 'The console is built for healthcare data work, and gives you controls for it: page access, data levels, which '
           + 'models may see each level, how long runs keep data, review before results are used, and an audit of who did what.',
      todo: [
        'Set up and try pipelines with synthetic or de-identified records first; every example in this guide is made up.',
        'Under Administration › Data policies, choose which models may see sensitive data and how long runs keep it.',
        'Give reviewers and viewers profiles that open only the pages their work needs.',
      ],
      notes: [
        'A model\'s answer is a draft: a person approves or rejects it in Review, and a report is approved and signed by a person.',
        'The Sensitive data level starts as Local only: only model connections your organisation runs itself may see it, until an administrator says otherwise.',
        'Meeting your organisation\'s privacy and regulatory obligations depends on how you configure and use the console; it does not by itself make a workspace compliant with any law or standard.',
      ],
    },
  ];

  readonly sections: Section[] = [
    ...this.steps.map(s => ({ id: s.id, title: s.title })),
    { id: 'reference', title: 'Reference' },
  ];

  /** The menu's groups, entries and tabs, from the menu's own tree: the guide's map never drifts from the menu. */
  readonly menu: MapRow[] = NAV.flatMap((item): MapRow[] => item.children
    ? item.children.filter(c => !c.crumbOnly).map(c => ({ group: item.label, entry: c.label, path: c.path, tabs: (c.tabs ?? []).map(t => t.label).join(', '), gate: c }))
    : item.path ? [{ group: '', entry: item.label, path: item.path, tabs: (item.tabs ?? []).map(t => t.label).join(', '), gate: item }] : []);

  private readonly nav = inject(NavAccess);

  /**
   * Whether the map links an entry: by the menu's own rule (NavAccess, as the shell's menu) for a signed-in reader, so a
   * workspace administrator is not sent to Platform's "Not available" (2026-10-20); signed out, every entry but the
   * role-only ones (the sign-in comes first either way).
   */
  linked(m: MapRow): boolean {
    return this.auth.isLoggedIn() ? this.nav.visible(m.gate) : !roleOnly(m.gate);
  }

  /** Why an entry is not linked: the role it is for, or the reader's page access. */
  notLinkedWhy(m: MapRow): string {
    const role = roleOnly(m.gate);
    return role ? `for ${role}` : 'not in your page access';
  }

  readonly frequencies = [
    { name: 'Mint', means: 'Every so many minutes', intervals: '5, 10, 15 … 55' },
    { name: 'Hr', means: 'Every so many hours', intervals: '1 – 12' },
    { name: 'Daily', means: 'Every so many days', intervals: '1 – 6' },
    { name: 'Weekly', means: 'Every so many weeks, or on named weekdays', intervals: '1 – 4' },
    { name: 'Monthly', means: 'Every so many months, or on a date each month', intervals: '1 – 6' },
    { name: 'Cron', means: 'A cron expression, in server time: minute hour day-of-month month day-of-week', intervals: 'none — e.g. 0 3 * * *' },
  ];

  readonly roles = [
    { name: 'Platform administrator', note: 'Every workspace, the requests for new ones, the rate cards and the settings that apply across all of them.' },
    { name: 'Workspace administrator', note: 'Everything inside one workspace: its people and page access, connections, pipelines, schedules, settings, alerts and bills; decides any run\'s review.' },
    { name: 'Workspace member', note: 'Runs, reviews and reads within their workspace — the pages their page-access profile opens (all of them when the workspace uses no profiles).' },
  ];

  readonly outcomes = [
    { name: 'Queue', note: 'Due and handed to the engine; not started yet.' },
    { name: 'Start / Running', note: 'Its steps are running and reporting progress.' },
    { name: 'Completed', note: 'Finished, and whatever it produced has been written.' },
    { name: 'Waiting for review', note: 'Completed, with results held until someone approves them in Review.' },
    { name: 'Failed', note: 'Stopped with a reason. The run\'s page says which step and why; it can be retried from that step.' },
    { name: 'Interrupt', note: 'Stopped before it finished — cancelled, or a worker went away. Counts against the success rate like Failed.' },
    { name: 'Skip', note: 'Passed over deliberately — by a person, or because the schedule\'s last run was still in flight.' },
    { name: 'Missed', note: 'Its slot went by while nothing was running to take it.' },
  ];

  /**
   * Scrolls to a section without leaving the page.
   *
   * The href stays for what it tells a reader (and a middle-click), but a plain "#id" resolves
   * against <base href="/"> to "/#id" -- the landing page -- so the click itself is handled here.
   * The address still gains the fragment, so a section can be linked to.
   */
  jump(event: Event, id: string): void {
    const target = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`#${id}`);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
    this.current.set(id);
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
