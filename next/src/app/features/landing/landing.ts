import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { ConsolePreview } from './console-preview';
import { ThemeService } from '../../core/theme.service';

/**
 * The public front door.
 *
 * Everything named here is something the console genuinely does today -- a visitor who signs in finds what the page
 * promised. Owner 2026-10-12: it is sold as a healthcare ETL, so the marketing copy leads with the clinical flow (data
 * in, an AI draft, a clinician's review, a signed report, dashboards) in one section of its own, with synthetic examples
 * only, and shows the same flow works for any data that needs a person's sign-off. No compliance claim: the console
 * gives controls, and does not by itself make anyone compliant with a law or standard. The preview stays domain-neutral
 * (b97b1880). The hero shows the product rather than describing it, built from the same tokens.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, Icon, BrandMark, ConsolePreview],
  styleUrls: ['./landing.tokens.css'],
  styles: [`
    :host { display: block; }

    /* The hero is one deep surface in both themes rather than a tint of the page, so the
       product panel on it reads as lit from within. Stated explicitly -- a transparent hero
       would borrow whichever ground happened to sit behind it. */
    .hero {
      background:
        radial-gradient(70rem 40rem at 12% -20%, color-mix(in srgb, var(--hero-glow-a) 55%, transparent), transparent 62%),
        radial-gradient(55rem 32rem at 88% 4%, color-mix(in srgb, var(--hero-glow-b) 20%, transparent), transparent 60%),
        linear-gradient(180deg, var(--hero-top) 0%, var(--hero-bottom) 100%);
      color: var(--hero-fg);
    }
    .hero-sub     { color: color-mix(in srgb, var(--hero-fg) 72%, transparent); }
    .hero-eyebrow { color: color-mix(in srgb, var(--hero-eyebrow) 95%, transparent); }
    /* A ghost button on the hero takes the hero's text colour, not the theme's. */
    .hero .btn-ghost { color: inherit; }
    /* A bordered button in the hero's header bar is outlined in the hero's own text colour, not the page's raised surface. */
    .hero header .btn-default { color: inherit; background: transparent; border-color: color-mix(in srgb, var(--hero-fg) 38%, transparent); }
    .hero header .btn-default:hover { background: color-mix(in srgb, var(--hero-fg) 10%, transparent); border-color: color-mix(in srgb, var(--hero-fg) 60%, transparent); }
    .rise-late { animation-delay: .12s; }
    .step-marker { background: var(--surface-raised); border: 1px solid var(--border-subtle); color: var(--accent-text); }

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
    <div class="min-h-screen flex flex-col bg-page">

      <!-- Hero ------------------------------------------------------------------- -->
      <div class="hero">
        <header>
          <div class="mx-auto w-full max-w-6xl px-5 h-16 flex items-center gap-3">
            <app-brand-mark />
            <div class="ml-auto flex items-center gap-1.5">
              <a routerLink="/docs" class="btn btn-default btn-sm hidden sm:inline-flex">Setup guide</a>
              <button type="button" class="btn btn-ghost btn-icon btn-sm"
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
              Healthcare data pipelines, with a person in the loop
            </p>
            <h1 class="text-4xl sm:text-5xl font-semibold leading-[1.08] tracking-tight text-balance">
              From raw data to a report a clinician signed.
            </h1>
            <p class="hero-sub mt-5 text-base sm:text-lg leading-relaxed max-w-xl">
              Bring data in, let a model write the first draft, have a person review it, and finish
              with a signed report and the dashboards behind it. Every run keeps its steps, its
              files and its outcome — so a question about last Tuesday has an answer.
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <a routerLink="/login" class="btn btn-primary">
                Sign in<app-icon name="arrowRight" size="0.95em" />
              </a>
              <a routerLink="/request-workspace" class="btn btn-default btn-sm">
                Request a workspace
              </a>
              <a routerLink="/docs" class="link-inline hero-eyebrow text-sm">
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

          <!-- The preview is its own component: it is a small app in itself, with three views
               and their data, and the landing page should not carry that. -->
          <div class="rise rise-late" aria-hidden="true">
            <app-console-preview />
          </div>
        </div>
      </div>

      <!-- Capabilities ------------------------------------------------------------ -->
      <section class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
        <div class="max-w-2xl">
          <h2 class="text-2xl font-semibold tracking-tight">Everything the work needs, in one place</h2>
          <p class="mt-2 text-[color:var(--text-secondary)] leading-relaxed">
            Data in, pipelines, AI, review, reports, dashboards and access — so getting from a file
            to a signed result does not mean stitching six tools together. For any data that needs a
            person's sign-off, not only clinical data.
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
      <section class="border-y bg-raised border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <h2 class="text-2xl font-semibold tracking-tight">A clinical review flow, end to end</h2>
          <p class="mt-2 text-[color:var(--text-secondary)] max-w-3xl">
            Five steps, and the console shows you each of them. The example is an imaging review on
            synthetic studies; the same flow serves any data a person must check before it is used.
          </p>

          <ol class="mt-10 relative step-line grid gap-8 sm:grid-cols-2 lg:grid-cols-5" data-test="landing-flow">
            @for (step of steps; track step.title; let i = $index) {
              <li class="relative">
                <div class="size-[2.1rem] rounded-full grid place-items-center text-xs font-semibold relative z-10 step-marker">
                  {{ i + 1 }}
                </div>
                <h3 class="mt-3.5 text-sm font-semibold">{{ step.title }}</h3>
                <p class="mt-1.5 text-sm text-[color:var(--text-secondary)] leading-relaxed">
                  {{ step.body }}
                </p>
              </li>
            }
          </ol>
          <p class="mt-8 text-sm text-[color:var(--text-muted)] max-w-3xl" data-test="landing-safe">
            The model's answer is always a draft for a person. Use synthetic or de-identified records while you set
            things up. The console gives you the controls; meeting your privacy and regulatory obligations depends on how
            you configure and use it, and it does not by itself make a workspace compliant with any law or standard.
          </p>
        </div>
      </section>

      <!-- Close -------------------------------------------------------------------- -->
      <section class="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
        <div class="card p-8 sm:p-10 flex flex-wrap items-center gap-6">
          <div class="min-w-0">
            <h2 class="text-xl font-semibold tracking-tight">Ready when you are</h2>
            <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
              Sign in to see your pipelines, what waits for your review, and your reports.
            </p>
          </div>
          <a routerLink="/login" class="btn btn-primary ml-auto">
            Sign in<app-icon name="arrowRight" size="0.95em" />
          </a>
        </div>
      </section>

      <footer class="mt-auto border-t border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 py-6 flex flex-wrap items-center gap-3">
          <span class="text-sm text-[color:var(--text-muted)]">
            ETL Console — data pipelines, review and signed reports.
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
    { label: 'Pipeline stages', value: '6' },
    { label: 'Storage backends', value: '4' },
    { label: 'Report formats', value: 'PDF · HTML' },
    { label: 'Models', value: 'Local or hosted' },
  ];

  readonly capabilities = [
    { icon: 'download', title: 'Data in from where it lives',
      body: 'S3, Azure, MinIO and FTP storage, databases and APIs. Documents read into fields, forms, an '
          + 'email-in address and a file drop — each one can start a run.' },
    { icon: 'layers', title: 'Pipelines you can read',
      body: 'Steps grouped by stage — read, check, transform, AI, review, write — and drawn as a flow. '
          + 'Describe one to the AI Assistant, add the steps yourself, or copy one you have.' },
    { icon: 'sparkle', title: 'AI that drafts, never decides',
      body: 'A model step\'s answer is a first draft, and a run\'s results can wait for a person before anyone '
          + 'uses them. Pick the model for each prompt — models you run yourself included — and keep sensitive data on local models.' },
    { icon: 'inbox', title: 'A person in the loop',
      body: 'Approvals, run results and documents waiting for a decision in one Review list with one '
          + 'count. In an imaging review the reviewer sees the image, the draft and its measurements, then decides.' },
    { icon: 'file', title: 'Reports a person signs',
      body: 'Templates with your brand, tables with totals, charts, KPI tiles, QR codes and watermarks, '
          + 'filled by a pipeline or by hand. Someone who did not generate a version approves and '
          + 'digitally signs it, and the console checks that signature on any copy later.' },
    { icon: 'chart', title: 'Dashboards and questions',
      body: 'Boards of tiles over your pipelines\' results, filtered by date and value. Ask your data a '
          + 'question in plain words and pin the chart it answers with.' },
    { icon: 'clock', title: 'Schedules, triggers and backfills',
      body: 'A timetable, or a file dropped, an email in, a document approved or a form submitted. Retry a '
          + 'failed run from the step that failed, or run a past range again, a period at a time.' },
    { icon: 'shield', title: 'Separated, controlled, audited',
      body: 'Every workspace on its own. Roles and page access, two-factor sign-in and single sign-on, '
          + 'how long data is kept, and a record of who did what.' },
    { icon: 'terminal', title: 'An API for your systems',
      body: 'Start runs, send files and events, read results and be told by webhooks — with a sandbox to '
          + 'build in and a developer portal with samples in curl, Python and Node.js.' },
  ];

  /** Synthetic throughout: an imaging review on made-up studies, the flow the console is sold on. */
  readonly steps = [
    { title: 'Data in',
      body: 'A synthetic study and its record arrive through the file drop, a form or a schedule.' },
    { title: 'AI draft',
      body: 'A model reads it and writes a first finding with its measurements, marked DRAFT.' },
    { title: 'Clinician review',
      body: 'The reviewer sees the image, the draft and the measurements in Review, and decides.' },
    { title: 'Signed report',
      body: 'A Generate report step makes the PDF; a clinician who did not generate it approves and signs it.' },
    { title: 'Dashboards',
      body: 'Results roll up into boards of tiles and answers to plain questions, by day and by outcome.' },
  ];
}
