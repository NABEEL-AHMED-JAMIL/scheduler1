import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { ManagedBanner } from '../../shared/ui/managed-banner';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { Colleague, RequestRow, WorkflowDetail, WorkflowSummary, WorkflowsApi } from './workflows.api';
import { DraftStep, OPERATORS, STEP_TYPES, StepType, Who, WhoKind, fromJson, newStep, problemStep, toJson } from './designer.model';
import { shortTime } from './history';
import { splitTail } from './inbox-list';

/** The platform made it -- a service's built-in workflow (builtIn, or createdBy 0 from a service that predates it). */
export function isBuiltIn(w: Pick<WorkflowSummary, 'builtIn' | 'createdBy'>): boolean {
  return w.builtIn ?? w.createdBy === 0;
}

/**
 * The Workflow designer (MIG-276): an administrator lays out a workflow's steps as a chain of cards -- who approves,
 * what is checked, what runs -- edits one at a time in the panel beside it, and publishes the chain as the next version.
 * The server checks the steps (WorkflowSteps) and names each problem where it is; the designer puts it on its card.
 * Running requests keep the version they started with. A test run starts a request as the administrator and opens it.
 * Everyone else with the page reads the workflows but changes nothing.
 *
 * Laid out as the Task inbox is (owner, 2026-10-06: "redesign the page"): two panes that fill the screen and scroll on
 * their own -- the workflows, with a pinned search and status filter, and the workflow opened from them, its header and
 * tabs on top, the canvas and the step's properties side by side, and the publish bar pinned at its foot. Below 1024 px
 * one pane shows at a time (data-pane) and the properties slide over from the right (data-sheet).
 */
@Component({
  selector: 'app-workflow-designer',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Icon, StatusPill, Combobox, ManagedBanner],
  templateUrl: './workflow-designer.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class WorkflowDesigner implements OnInit {
  private readonly api = inject(WorkflowsApi);
  private readonly http = inject(HttpClient);
  private readonly profiles = inject(AccessProfilesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  readonly auth = inject(AuthService);

  readonly types = STEP_TYPES;
  readonly operators = OPERATORS;

  readonly workflows = signal<WorkflowSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly current = signal<WorkflowDetail | null>(null);
  /** A key a link named that this workspace has no workflow for: the detail pane says so instead of opening another. */
  readonly missingKey = signal<string | null>(null);

  /** The chain being edited; `dirty` once it differs from what was loaded. */
  readonly steps = signal<DraftStep[]>([]);
  readonly dirty = signal(false);
  readonly selected = signal<number | null>(null);
  readonly problems = signal<string[]>([]);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly adding = signal(false);
  /** Where the Add a step menu inserts: before the step at this index (the length is the end); null is after the
   *  selected step, as before. */
  readonly insertAt = signal<number | null>(null);
  readonly view = signal<'steps' | 'history' | 'test' | 'new'>('steps');

  // the list's search and status filter
  readonly query = signal('');
  readonly statusFilter = signal<'' | 'Active' | 'Inactive'>('');
  /** Below 1024 px one pane shows at a time: the list, or the workflow opened from it. */
  readonly pane = signal<'list' | 'detail'>('list');
  /** Below 1024 px the step's properties slide over the canvas; open once a step is picked, until closed. */
  readonly sheet = signal(false);
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('search');

  readonly colleagues = signal<Colleague[]>([]);
  private readonly colleaguesLoaded = signal(false);
  /** P2 #36: the workspace has nobody but the reader, so an approval has no one to decide it. */
  readonly soleMember = computed(() => this.colleaguesLoaded()
    && !this.colleagues().some(c => c.userId !== this.auth.user()?.appUserId));
  readonly groups = signal<{ id: number; name: string }[]>([]);
  readonly jobs = signal<{ jobId: number; jobName?: string }[]>([]);

  // new workflow
  readonly newName = signal('');
  readonly newKey = signal('');
  readonly newDescription = signal('');
  readonly newSubject = signal('request');

  // test run
  readonly testTitle = signal('');
  readonly testSubjectId = signal('');
  readonly testSubject = signal('{\n  "amount": 1200\n}');
  readonly testStarted = signal<RequestRow | null>(null);

  /** A sign-in with no workspace of its own (a platform administrator's): workflows are a workspace's, so nothing is read. */
  readonly noWorkspace = computed(() => !this.auth.user()?.tenantId);
  readonly canEdit = computed(() => this.auth.isTenantAdmin() && !this.auth.builderLocked() && !this.noWorkspace());
  /** MIG-324: an empty list says what a workflow is and who makes one. */
  readonly emptyText = computed(() => this.canEdit()
    ? 'No workflows yet. New workflow makes one: the steps a request goes through, approvals and notices included.'
    : 'No workflows yet. A workspace administrator makes them.');

  /** The workflows the search and status filter leave, in the service's order (by name). */
  readonly shown = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const status = this.statusFilter();
    return this.workflows().filter(w => (!status || w.status === status)
      && words.every(word => `${w.name} ${w.key} ${w.description ?? ''}`.toLowerCase().includes(word)));
  });

  /**
   * The shown workflows in their groups, as the Task inbox's day groups: Built in (made by the platform) first, then the
   * workspace's own. A group nothing is left in has no header.
   */
  readonly groupsShown = computed(() => {
    const rows = this.shown();
    return [
      { label: 'Built in', rows: rows.filter(isBuiltIn) },
      { label: 'This workspace', rows: rows.filter(w => !isBuiltIn(w)) },
    ].filter(g => g.rows.length);
  });

  readonly statusChoices: { value: '' | 'Active' | 'Inactive'; label: string }[] = [
    { value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: '', label: 'All' }];

  readonly statusCounts = computed<Record<'' | 'Active' | 'Inactive', number>>(() => {
    const rows = this.workflows();
    return { '': rows.length, Active: rows.filter(w => w.status === 'Active').length, Inactive: rows.filter(w => w.status === 'Inactive').length };
  });

  readonly hasFilters = computed(() => !!this.query().trim() || !!this.statusFilter());

  /** "28 workflows", or "3 of 28" while the search or filter leaves some out. */
  readonly shownLine = computed(() => {
    const all = this.workflows().length;
    const shown = this.shown().length;
    return this.hasFilters() ? `${shown} of ${all}` : `${all} workflow${all === 1 ? '' : 's'}`;
  });

  /** The platform made it (a service's built-in workflow); the workspace may still change it. */
  readonly builtIn = computed(() => { const wf = this.current(); return !!wf && isBuiltIn(wf); });

  readonly step = computed<DraftStep | null>(() => {
    const i = this.selected();
    return i === null ? null : this.steps()[i] ?? null;
  });

  readonly keys = computed(() => this.steps().map(s => s.key));

  /** Where a step may go next: any other step, or the end. */
  readonly targets = computed(() => this.steps().map(s => ({ key: s.key, label: s.name || s.key })));

  readonly workflowProblems = computed(() => this.problems().filter(p => problemStep(p) === null));

  readonly colleagueOptions = computed<ComboboxOption[]>(() => this.colleagues()
    .map(c => ({ value: String(c.userId), label: c.fullName || c.username, hint: c.username })));

  readonly jobOptions = computed<ComboboxOption[]>(() => this.jobs()
    .map(j => ({ value: String(j.jobId), label: j.jobName || `Schedule #${j.jobId}`, hint: `#${j.jobId}` })));

  ngOnInit(): void {
    if (this.noWorkspace()) { this.loading.set(false); return; }
    this.api.colleagues().subscribe({ next: r => { if (r.status === API_SUCCESS) { this.colleagues.set(r.data ?? []); this.colleaguesLoaded.set(true); } }, error: () => {} });
    if (this.auth.isTenantAdmin()) {
      this.profiles.list().subscribe({
        next: r => { if (r.status === API_SUCCESS) this.groups.set((r.data ?? []).map(p => ({ id: p.pageAccessProfileId, name: p.profileName }))); },
        error: () => {},
      });
    }
    this.http.get<ApiResponse<{ jobId: number; jobName?: string }[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.jobs.set(Array.isArray(r.data) ? r.data : []); },
      error: () => {},
    });
    const linked = this.route.snapshot.queryParamMap.get('key');
    // A link to one workflow opens on it, below 1024 px too.
    if (linked) this.pane.set('detail');
    this.loadList(linked);
  }

  loadList(open?: string | null): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'Workflows could not be read.'); return; }
        const rows = r.data ?? [];
        this.workflows.set(rows);
        // A link to a workflow this workspace does not have -- another workspace's, a deleted one, a typo. Said plainly in
        // the detail pane, beside the list, rather than a toast over an empty page; nothing else is opened in its place.
        if (open && !rows.some(w => w.key === open)) { this.showMissing(open); return; }
        // With nothing named, the first row as the list draws it: Built in comes first.
        const key = open ?? this.current()?.key ?? (rows.find(isBuiltIn) ?? rows[0])?.key;
        if (key) this.open(key, true);
        else if (this.canEdit()) this.view.set('new');
      },
      error: () => { this.loading.set(false); this.error.set('Workflows could not be read.'); },
    });
  }

  async choose(key: string): Promise<void> {
    if (key === this.current()?.key && this.view() !== 'new') { this.pane.set('detail'); return; }
    if (this.dirty() && !(await confirmWith(this.dialog, { title: 'Leave without publishing?',
      body: 'The changes to these steps are not published and will be lost.', confirmLabel: 'Leave', danger: true }))) return;
    this.sheet.set(false);
    this.pane.set('detail');
    this.open(key);
  }

  /** Back to the list, below 1024 px. */
  backToList(): void {
    this.sheet.set(false);
    this.pane.set('list');
  }

  setQuery(value: string): void {
    this.query.set(value);
  }

  clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('');
  }

  /** A workflow's name, split so a narrow row cuts its middle and keeps a trailing number ("E2E purchase 1006022333"). */
  nameParts(name: string): { name: string; ref: string } {
    return splitTail(name);
  }

  /** / searches the list; Escape closes the step's slide-over, then the Add a step menu. */
  onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest('.cdk-overlay-container')) return;
    if (e.key === 'Escape') {
      if (this.sheet()) { this.closeSheet(); return; }
      if (this.adding()) { this.cancelAdd(); return; }
    }
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    if (e.key === '/') { e.preventDefault(); this.searchBox()?.nativeElement.focus(); }
  }

  open(key: string, quiet = false): void {
    this.api.fetch(key).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { if (!quiet) this.toast.error(r.message || 'That workflow could not be read.'); return; }
        this.missingKey.set(null);
        this.current.set(r.data);
        this.loadVersion(r.data.versions[0]?.steps);
        // Nothing published yet: an administrator starts from one approval step rather than an empty page.
        if (!r.data.versions.length && this.canEdit()) {
          this.steps.set([newStep('approval', [])]);
          this.selected.set(0);
          this.dirty.set(true);
        }
        // A background (quiet) open never takes the reader off a New workflow form they opened meanwhile.
        if (!quiet || this.view() !== 'new') this.view.set('steps');
        this.testStarted.set(null);
        this.router.navigate([], { relativeTo: this.route, queryParams: { key }, replaceUrl: true });
      },
      error: (e: unknown) => {
        if ((e as { status?: number })?.status === 404) { this.showMissing(key); return; }
        if (!quiet) this.toast.error('That workflow could not be read. Try again.');
      },
    });
  }

  /** No workflow by this key here: nothing is open, the link's key leaves the address, the pane says which key it was. */
  private showMissing(key: string): void {
    this.current.set(null);
    this.steps.set([]);
    this.selected.set(null);
    this.dirty.set(false);
    this.view.set('steps');
    this.missingKey.set(key);
    this.router.navigate([], { relativeTo: this.route, queryParams: { key: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private loadVersion(json: string | undefined | null): void {
    const steps = fromJson(json);
    this.steps.set(steps);
    this.selected.set(steps.length ? 0 : null);
    this.problems.set([]);
    this.dirty.set(false);
    this.note.set('');
  }

  // ---- editing the chain ------------------------------------------------------------------------------------------

  /** A step picked on the canvas: its properties beside it, or sliding over below 1024 px. */
  pick(i: number): void {
    this.selected.set(i);
    this.sheet.set(true);
  }

  closeSheet(): void {
    this.sheet.set(false);
  }

  /** Opens the Add a step menu where it inserts: before step `at`, or at the end. */
  openAdd(at: number): void {
    this.insertAt.set(at);
    this.adding.set(true);
  }

  cancelAdd(): void {
    this.adding.set(false);
    this.insertAt.set(null);
  }

  add(type: StepType): void {
    const step = newStep(type, this.keys());
    const at = this.insertAt() ?? (this.selected() === null ? this.steps().length : this.selected()! + 1);
    this.steps.update(list => [...list.slice(0, at), step, ...list.slice(at)]);
    this.selected.set(at);
    this.cancelAdd();
    this.sheet.set(true);
    this.touch();
  }

  move(i: number, by: -1 | 1): void {
    const j = i + by;
    const list = [...this.steps()];
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.steps.set(list);
    this.selected.set(j);
    this.touch();
  }

  remove(i: number): void {
    const gone = this.steps()[i];
    this.steps.update(list => list.filter((_, n) => n !== i).map(s => unlink(s, gone.key)));
    this.selected.set(this.steps().length ? Math.min(i, this.steps().length - 1) : null);
    this.touch();
  }

  /** Changes a field of the selected step. */
  set<K extends keyof DraftStep>(field: K, value: DraftStep[K]): void {
    const i = this.selected();
    if (i === null) return;
    this.steps.update(list => list.map((s, n) => n === i ? { ...s, [field]: value } : s));
    this.touch();
  }

  /** Renames the selected step's key, and every link to it. */
  rekey(value: string): void {
    const i = this.selected();
    if (i === null) return;
    const next = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '').slice(0, 64);
    const old = this.steps()[i].key;
    if (!next || next === old) return;
    this.steps.update(list => list.map((s, n) => relink(n === i ? { ...s, key: next } : s, old, next)));
    this.touch();
  }

  setWho(field: 'assignee' | 'escalateTo' | 'to', kind: WhoKind | '', value?: string | null): void {
    if (field === 'escalateTo' && kind === '') { this.set('escalateTo', null); return; }
    const who: Who = { kind: kind as WhoKind, value: value ?? null };
    this.set(field, who);
  }

  setCondition(part: 'field' | 'op' | 'value', value: string): void {
    const c = { ...(this.step()?.condition ?? { field: '', op: 'eq' }) };
    if (part === 'value') c.value = parseValue(value, c.op);
    else c[part] = value;
    if (part === 'op' && !OPERATORS.find(o => o.op === value)?.needsValue) delete c.value;
    this.set('condition', c);
  }

  conditionValue(step: DraftStep): string {
    const v = step.condition?.value;
    return Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  }

  needsValue(step: DraftStep): boolean {
    return !!OPERATORS.find(o => o.op === step.condition?.op)?.needsValue;
  }

  numberOrNull(value: unknown): number | null {
    const n = Number(value);
    return value === '' || value == null || !Number.isFinite(n) ? null : Math.round(n);
  }

  private touch(): void {
    this.dirty.set(true);
    this.problems.set([]);
  }

  // ---- publishing ------------------------------------------------------------------------------------------------

  publish(): void {
    const wf = this.current();
    if (!wf || this.busy()) return;
    this.busy.set(true);
    this.api.publish(wf.key, toJson(this.steps()), this.note().trim() || null).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message);
          this.dirty.set(false);
          this.open(wf.key, true);
          this.loadList(wf.key);
        } else {
          const problems = r.data?.problems ?? [r.message];
          this.problems.set(problems);
          const first = problems.map(problemStep).find(n => n !== null);
          if (first != null) this.selected.set(first);
          this.toast.error(r.message);
        }
      },
      error: () => { this.busy.set(false); this.toast.error('The workflow could not be published. Try again.'); },
    });
  }

  discard(): void {
    this.loadVersion(this.current()?.versions[0]?.steps);
  }

  restore(version: number): void {
    const v = this.current()?.versions.find(x => x.version === version);
    if (!v) return;
    this.loadVersion(v.steps);
    this.dirty.set(true);
    this.note.set(`Back to version ${version}`);
    this.view.set('steps');
  }

  toggleStatus(): void {
    const wf = this.current();
    if (!wf) return;
    const status = wf.status === 'Active' ? 'Inactive' : 'Active';
    this.api.setStatus(wf.key, status).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.current.set({ ...wf, status }); this.loadList(wf.key); }
        else this.toast.error(r.message);
      },
      error: () => this.toast.error('That could not be done. Try again.'),
    });
  }

  // ---- a new workflow -------------------------------------------------------------------------------------------

  startNew(): void {
    this.sheet.set(false);
    this.pane.set('detail');
    this.newName.set('');
    this.newKey.set('');
    this.newDescription.set('');
    this.newSubject.set('request');
    this.missingKey.set(null);
    this.view.set('new');
  }

  nameChanged(name: string): void {
    const derived = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    if (!this.newKey() || this.newKey() === derived(this.newName())) this.newKey.set(derived(name));
    this.newName.set(name);
  }

  create(): void {
    const name = this.newName().trim();
    const key = this.newKey().trim();
    if (!name || !key || this.busy()) return;
    this.busy.set(true);
    this.api.create({ key, name, description: this.newDescription().trim() || null, subjectType: this.newSubject().trim() || 'request' }).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message);
          this.view.set('steps');
          this.loadList(key);
        } else {
          this.toast.error(r.message);
        }
      },
      error: () => { this.busy.set(false); this.toast.error('The workflow could not be created. Try again.'); },
    });
  }

  // ---- a test run ------------------------------------------------------------------------------------------------

  testRun(): void {
    const wf = this.current();
    if (!wf || this.busy()) return;
    let subject: unknown;
    try {
      subject = this.testSubject().trim() ? JSON.parse(this.testSubject()) : {};
    } catch {
      this.toast.error('The request\'s fields are not valid JSON.');
      return;
    }
    const subjectId = this.testSubjectId().trim() || `test-${Date.now()}`;
    this.testStarted.set(null);
    this.busy.set(true);
    this.api.start({ definitionKey: wf.key, subjectId, title: this.testTitle().trim() || `Test of ${wf.name}`, subject },
      `${wf.key}:test:${subjectId}`).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS && r.data) { this.testStarted.set(r.data); this.toast.success('Test request started.'); }
        else this.toast.error(r.message);
      },
      error: () => { this.busy.set(false); this.toast.error('The test could not start. Try again.'); },
    });
  }

  // ---- words ------------------------------------------------------------------------------------------------------

  typeOf(type: StepType) {
    return STEP_TYPES.find(t => t.type === type)!;
  }

  /** A step's name as the canvas and screen readers say it. */
  stepName(s: DraftStep): string {
    return s.name || s.key;
  }

  problemsOf(i: number): string[] {
    return this.problems().filter(p => problemStep(p) === i).map(p => p.replace(/^steps\[\d+\]\.?/, '').replace(/^:\s*/, ''));
  }

  /** One line under a card: who, or what, or where. */
  summary(s: DraftStep): string {
    switch (s.type) {
      case 'approval':
      case 'task':
        return [this.who(s.assignee), s.slaHours ? `due in ${hours(s.slaHours)}` : '', s.slaHours ? `then ${this.who(s.escalateTo ?? { kind: 'manager' })}` : '']
          .filter(Boolean).join(' · ');
      case 'condition': {
        const c = s.condition;
        const op = OPERATORS.find(o => o.op === c?.op)?.label ?? c?.op;
        return `If ${c?.field || '…'} ${op}${this.needsValue(s) ? ' ' + this.conditionValue(s) : ''}`;
      }
      case 'notify': return `Tell ${this.who(s.to)}`;
      case 'run_pipeline': return s.jobId ? this.jobName(s.jobId) : 'No schedule picked';
      case 'save_dataset': return `Into ${s.dataset || '…'}`;
      case 'wait': return s.hours ? `For ${hours(s.hours)}` : 'For …';
    }
  }

  branches(s: DraftStep): string {
    return `Yes → ${this.targetName(s.whenTrue)} · No → ${this.targetName(s.whenFalse)}`;
  }

  targetName(key: string | null | undefined): string {
    if (!key || key === 'end') return 'end';
    const s = this.steps().find(x => x.key === key);
    return s ? (s.name || s.key) : `“${key}”`;
  }

  who(w: Who | null | undefined): string {
    switch (w?.kind) {
      case 'user': {
        const c = this.colleagues().find(x => String(x.userId) === String(w.value));
        return c ? (c.fullName || c.username) : w.value ? `user ${w.value}` : 'a person (pick one)';
      }
      case 'role': return w.value === 'TENANT_ADMIN' ? 'the administrators' : 'any member';
      case 'group': {
        const g = this.groups().find(x => String(x.id) === String(w.value));
        return g ? `the ${g.name} group` : 'a group';
      }
      case 'manager': return 'the requester\'s manager';
      case 'requester': return 'the requester';
      default: return 'someone';
    }
  }

  jobName(id: number): string {
    return this.jobs().find(j => j.jobId === id)?.jobName ?? `schedule #${id}`;
  }

  personName(id: number | null | undefined): string {
    if (id == null) return '';
    const c = this.colleagues().find(x => x.userId === id);
    return c ? (c.fullName || c.username) : `user ${id}`;
  }

  when(iso: string | null | undefined): string {
    return iso ? shortTime(iso) : '';
  }

  stepCount(json: string): number {
    return fromJson(json).length;
  }
}

function hours(n: number): string {
  return n % 24 === 0 ? `${n / 24} day${n === 24 ? '' : 's'}` : `${n} hour${n === 1 ? '' : 's'}`;
}

function parseValue(text: string, op: string): unknown {
  const one = (v: string): unknown => {
    const t = v.trim();
    if (t === 'true' || t === 'false') return t === 'true';
    return t !== '' && Number.isFinite(Number(t)) ? Number(t) : t;
  };
  return op === 'in' ? text.split(',').map(one).filter(v => v !== '') : one(text);
}

/** A step with every link to `from` pointed at `to`. */
function relink(s: DraftStep, from: string, to: string): DraftStep {
  const swap = (k: string | null | undefined) => (k === from ? to : k);
  return { ...s, next: swap(s.next), whenTrue: swap(s.whenTrue), whenFalse: swap(s.whenFalse), onReject: swap(s.onReject) };
}

/** A step with every link to a removed step sent to the end. */
function unlink(s: DraftStep, gone: string): DraftStep {
  const drop = (k: string | null | undefined) => (k === gone ? (s.type === 'condition' ? 'end' : null) : k);
  return { ...s, next: drop(s.next), whenTrue: drop(s.whenTrue), whenFalse: drop(s.whenFalse), onReject: s.onReject === gone ? 'end' : s.onReject };
}
