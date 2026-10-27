/**
 * The in-app guide's content (owner 2026-10-13: rewritten for the current product; 2026-10-26: shown as a help centre).
 *
 * Kept apart from the page (docs.ts) so the words are in one place: the articles in the menu's order, the topics they
 * are grouped under (the chapters of etl-platform/docs/showcase/guide-outline.md, the client book this help mirrors), the
 * popular how-tos and what is new. Healthcare-safe: every example is synthetic, and nothing here claims the console makes
 * a workspace compliant with a law or standard. The frequencies and intervals come from ProcessTimeUtil; if those change,
 * this file is wrong and should be changed with it.
 */

export interface StepField { name: string; required: boolean; note: string; }

/** A place in the console: where the menu shows it ("Run & review › Review"), and its address. */
export interface Place { label: string; path: string; }

/** Something to copy as it is: a call, an expression, a file name. */
export interface CodeSample { label: string; text: string; }

/** One article: a task, where it is done, what to do in order, and what is good to know. */
export interface Step {
  id: string;
  title: string;
  intro: string;
  /** Where it is done, as links into the console. */
  where?: Place[];
  /** What to do, in order. */
  todo?: string[];
  /** Copyable samples, shown after the steps. */
  code?: CodeSample[];
  fields?: StepField[];
  /** A way to save time or trouble, shown as a tip. */
  tip?: string;
  notes?: string[];
  warn?: string;
}

export const STEPS: Step[] = [
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
      'To require two-factor sign-in of some people only (clinicians, say), turn on Require two-factor sign-in on their access profile: they set up an authenticator app at their next sign-in. The profile and the people list show who has it on and who not yet.',
    ],
    tip: 'Give the workspace at least two administrators, so nobody is locked out when one is away.',
    notes: [
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
      'Forms: build a form whose answers start a pipeline or feed a review. In a field\'s settings, a Placeholder shows example '
        + 'text inside its empty box (up to 120 characters) and Help text a short hint under it (up to 500); the canvas shows both as you type.',
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
      'For scanned documents, add Split pages, then Read text from pages: it reads the page images with the platform\'s own OCR (only the pages '
        + 'with no text layer, unless you choose Every page), adds the text and how sure it is, and marks a page below the sureness you set Check by hand: '
        + 'it goes to Review with its image beside the text. Each page read is billed as ocr.pages.',
      'Save File and Upload to bucket write all the rows as one file; with One file per row they write a file for each row '
        + '— a folder of recordings, one insight file each — named from the row\'s columns, as in {{file_stem}}-insight.json. '
        + 'JSON columns are written as lists and objects rather than as text; Generate report reads its JSON columns the same way.',
      'On a schedule, set Read S3\'s Which objects to last_run: each run reads only the files written since the schedule\'s last '
        + 'completed run (a failed run moves nothing, so its files come again). Turn on The run\'s own files first and the same '
        + 'pipeline also takes a file that arrives in the inbox. Generate report with One report per row makes a report for each '
        + 'row — one per recording — each its own report in Reports › Library, named from the row, as in Call · {{file_name}}.',
      'In the pipeline\'s Settings, choose whether its results wait for a review, and whether that review may be decided in bulk or only one by one.',
      'For a sign-off in the middle of a run, add an Approval step and say who approves it in Approval workflows.',
      'To use another pipeline\'s answer, add a Run pipeline step: it calls that pipeline with parameters (once, or once per row) '
        + 'and takes its answer as rows. A chain of calls is at most three deep, and each call is a run of its own, billed as any run.',
      'In an approval workflow, a Run pipeline step can pass the request\'s values as the pipeline\'s parameters, wait for the run, '
        + 'and keep fields of its answer (registration.eligible, careplan.risk) for later conditions and assignees; the request\'s history shows them.',
    ],
    code: [{ label: 'A file name from the row\'s columns (One file per row)', text: '{{file_stem}}-insight.json' }],
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
      'Follow runs under Runs: Latest, By date, Analytics, Failed and Backfills. A run\'s page has the tabs Steps, Map, AI answers, Items, Outputs and Log.',
      'Items is there when the pipeline works item by item (each file, recording or document): every item with how it went at each step. '
        + 'Filter by Done or Failed, search a name or a value such as risk = High, and Open an item to see its steps, why it failed and its data at each step. '
        + 'A step that made many files (a page image per page) opens their list. Retry failed items runs only the failed ones again, from the step each failed at.',
      'Tick items to act on several at once (Select all N matching takes every item the filter and search find, on every page): Retry N failed '
        + 'retries only the failed ones, Download zip gives each item\'s files in a folder of its own, Export CSV the selected rows, and Send to review '
        + 'asks a team or a role to check them in Review › Approvals. A report already made for an item is kept: a retry makes only the reports it needs.',
      'A schedule\'s Items tab (beside its Runs) finds an item across all its runs (by name, or a value such as risk = High), newest first, with how '
        + 'each run started, the pipeline version, the status and the report. Tick two runs to compare them field by field, with what changed in the '
        + 'pipeline between them. An item\'s panel opens it with All runs of this item.',
      'On Outputs, View shows a file in place: a kept PDF in the PDF viewer, a kept table as a table, a file the run put in a bucket in the file preview. Download takes it away.',
      'Retry a failed run from the step that failed (Runs › Failed groups failures by their error), or run a schedule for each period of a past range (Backfills).',
    ],
    code: [{ label: 'A Cron schedule: every day at 03:00, in server time', text: '0 3 * * *' }],
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
      'Someone whose Analytics page is Saved Analyses alone opens, filters and pages the boards and exports a table tile; '
        + 'a statement of their own, or a file\'s rows outside a board, needs Analytics Studio.',
      'A new file — an upload, or a file a pipeline writes — is checked for sensitive columns (names, record numbers, '
        + 'national ids...) from a sample of its first rows before Analytics first reads it, so a viewer reads them masked from '
        + 'the first read. The Data Catalog shows what was found; an administrator may correct it.',
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
    tip: 'You can delete several reports at once in the Library: tick them, then Delete. Approved ones cannot be ticked.',
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
      'Invoices: each closed month, its lines frozen with the rate card that priced them, with payment slips, credit notes and a PDF. '
        + 'A month is issued once it is over in the workspace\'s billing time zone; until then its draft is rebuilt from the meter.',
      'Billing documents: every bill, slip and statement in one place. A statement lists what was issued in its range, oldest first, '
        + 'in the workspace\'s billing days: invoiced, credited, paid (net of refunds), the balance open and any credit owed to you.',
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
      'A pipeline that answers in seconds can be run and waited for: POST /v1/pipelines/{id}/runs?wait=30s answers its result in the same call (Run and wait in the portal).',
      'Your API clients, in the portal, shows what each client may call; APIs this workspace calls lists the saved requests your pipelines send out, and what each last answered.',
    ],
    code: [{ label: 'Run and wait (the customer API)', text: 'POST /v1/pipelines/{id}/runs?wait=30s' }],
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

export const FREQUENCIES = [
  { name: 'Mint', means: 'Every so many minutes', intervals: '5, 10, 15 … 55' },
  { name: 'Hr', means: 'Every so many hours', intervals: '1 – 12' },
  { name: 'Daily', means: 'Every so many days', intervals: '1 – 6' },
  { name: 'Weekly', means: 'Every so many weeks, or on named weekdays', intervals: '1 – 4' },
  { name: 'Monthly', means: 'Every so many months, or on a date each month', intervals: '1 – 6' },
  { name: 'Cron', means: 'A cron expression, in server time: minute hour day-of-month month day-of-week', intervals: 'none — e.g. 0 3 * * *' },
];

export const ROLES = [
  { name: 'Platform administrator', note: 'On their own sign-in, the platform\'s pages only: the workspaces, the requests for new ones, managed-service grants, Staff activity, service health, the engine settings, billing for every workspace, the rate cards, the catalogue of task types, the limits and the counts. A workspace\'s data — its pipelines, schedules, runs, files, boards, queries, documents, approved data, reports, forms, prompts and connections — opens only inside that workspace, with Work in this workspace on Platform › Workspaces; its pages say so on the own sign-in and read nothing.' },
  { name: 'Workspace administrator', note: 'Everything inside one workspace: its people and page access, connections, pipelines, schedules, settings, alerts and bills; decides any run\'s review.' },
  { name: 'Workspace member', note: 'Runs, reviews and reads within their workspace — the pages their page-access profile opens (all of them when the workspace uses no profiles).' },
];

export const OUTCOMES = [
  { name: 'Queue', note: 'Due and handed to the engine; not started yet.' },
  { name: 'Start / Running', note: 'Its steps are running and reporting progress.' },
  { name: 'Completed', note: 'Finished, and whatever it produced has been written.' },
  { name: 'Waiting for review', note: 'Completed, with results held until someone approves them in Review.' },
  { name: 'Failed', note: 'Stopped with a reason. The run\'s page says which step and why; it can be retried from that step.' },
  { name: 'Interrupt', note: 'Stopped before it finished — cancelled, or a worker went away. Counts against the success rate like Failed.' },
  { name: 'Skip', note: 'Passed over deliberately — by a person, or because the schedule\'s last run was still in flight.' },
  { name: 'Missed', note: 'Its slot went by while nothing was running to take it.' },
];

/** The Reference article (after the twelve tasks): the menu, the frequencies, the roles and the run outcomes. */
export const REFERENCE = { id: 'reference', title: 'Reference',
  intro: 'The menu, the schedule frequencies, the roles and what a run\'s status means, to look things up.' };

/**
 * A help-centre topic: one of the client book's chapters (guide-outline.md), the articles that cover it, and the console
 * pages it is about. A signed-in reader sees a topic when they may open at least one of its pages (the menu's own rule);
 * a topic with no pages (Getting started) is everyone's.
 */
export interface Topic {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  /** Article ids, in reading order. */
  articles: string[];
  /** The console pages it is about. */
  paths: string[];
}

export const TOPICS: Topic[] = [
  { id: 'getting-started', title: 'Getting started', icon: 'zap', blurb: 'Get a workspace, sign in, and find your way around the menu.',
    articles: ['start', 'reference'], paths: [] },
  { id: 'pipelines', title: 'Pipelines and steps', icon: 'layers', blurb: 'Build what a run does: read, check, transform, ask a model and write.',
    articles: ['build'], paths: ['/pipelines/list', '/ai/assistant'] },
  { id: 'triggers', title: 'Triggers', icon: 'clock', blurb: 'Run on a timetable, or when a file, an email, a document or a form arrives.',
    articles: ['run'], paths: ['/pipelines/schedules'] },
  { id: 'runs', title: 'Runs and the Items view', icon: 'history', blurb: 'Follow runs, open each item, retry what failed and be told when it does.',
    articles: ['run', 'monitor'], paths: ['/runs'] },
  { id: 'documents', title: 'Documents', icon: 'file', blurb: 'Send documents in, read their fields, and check what a model was unsure of.',
    articles: ['data-in', 'review'], paths: ['/documents', '/review/documents'] },
  { id: 'forms', title: 'Forms', icon: 'edit', blurb: 'Forms whose answers start a pipeline, feed a review or keep a dataset.',
    articles: ['data-in'], paths: ['/forms/builder', '/forms/submissions'] },
  { id: 'ai', title: 'AI', icon: 'sparkle', blurb: 'The AI Assistant, prompts, AI steps, and which models may see which data.',
    articles: ['build', 'health-data'], paths: ['/ai/assistant', '/pipelines/prompts'] },
  { id: 'report-studio', title: 'Report Studio', icon: 'template', blurb: 'Templates, generated reports, approval and digital signatures.',
    articles: ['reports'], paths: ['/reports/overview', '/reports/templates', '/reports/library'] },
  { id: 'dashboards', title: 'Dashboards and analysis', icon: 'chart', blurb: 'Boards, Ask your data, Analytics Studio, the Data Catalog and files.',
    articles: ['results'], paths: ['/data/analytics/dashboards', '/data'] },
  { id: 'approvals', title: 'Approvals and teams', icon: 'checkCircle', blurb: 'Everything waiting for a person, deciding in bulk, and who decides.',
    articles: ['review', 'people'], paths: ['/review', '/workflows/designer', '/administration/teams'] },
  { id: 'developers', title: 'Developers and API', icon: 'terminal', blurb: 'API clients, webhooks, the sandbox and the Developer portal.',
    articles: ['developers'], paths: ['/developers/api-clients', '/developers/portal'] },
  { id: 'billing', title: 'Billing', icon: 'card', blurb: 'What is metered, Cost & usage, invoices and billing documents.',
    articles: ['billing'], paths: ['/billing'] },
  { id: 'administration', title: 'Administration and security', icon: 'shield', blurb: 'People, page access, sign-in rules, data policies and roles.',
    articles: ['people', 'health-data', 'reference'], paths: ['/administration'] },
];

/** The how-tos people look for most: each opens its article at the steps. */
export interface HowTo { title: string; article: string; }

export const HOW_TOS: HowTo[] = [
  { title: 'Ask for a workspace and sign in for the first time', article: 'start' },
  { title: 'Add a person and choose the pages they open', article: 'people' },
  { title: 'Describe a pipeline to the AI Assistant', article: 'build' },
  { title: 'Schedule a pipeline or start it from a trigger', article: 'run' },
  { title: 'Retry only the failed items of a run', article: 'run' },
  { title: 'Approve or reject several items at once', article: 'review' },
  { title: 'Approve and sign a report', article: 'reports' },
  { title: 'Be alerted when a run fails', article: 'monitor' },
  { title: 'Make an API client for one of your systems', article: 'developers' },
];

/**
 * What is new in the guide, newest first. The guide has no changelog of its own: these are the latest changes its articles
 * describe (the customer API's own changelog is the Developer portal's).
 */
export interface WhatsNew { date: string; title: string; text: string; article: string; }

export const WHATS_NEW: WhatsNew[] = [
  { date: '2026-10-26', title: 'Placeholders and help in forms', article: 'data-in',
    text: 'A form\'s field can show example text inside its empty box and a hint under it, wherever the form is filled.' },
  { date: '2026-10-26', title: 'Run pipeline step', article: 'build',
    text: 'A pipeline can call another with parameters, once or once per row, and take its answer as rows.' },
  { date: '2026-10-26', title: 'Run and wait', article: 'developers',
    text: 'Your systems can start a quick pipeline and read its result in the same call.' },
  { date: '2026-10-26', title: 'Two-factor sign-in for some people only', article: 'people',
    text: 'Require it on an access profile; the profile and the people list show who has set it up.' },
  { date: '2026-10-22', title: 'Items of a run', article: 'run',
    text: 'Each file, recording or document a run works on, with how it went at each step; retry only the failed ones.' },
  { date: '2026-10-22', title: 'Read text from pages', article: 'build',
    text: 'Scanned pages read with the platform\'s own OCR; a page read unsurely goes to Review.' },
  { date: '2026-10-20', title: 'Report approvals in Review', article: 'reports',
    text: 'Ask for approval and the version waits in the reviewers\' Review › Approvals, beside Approve and sign.' },
];
