import { Component, OnInit, computed, inject, signal } from '@angular/core';
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

/**
 * The Workflow designer (MIG-276): an administrator lays out a workflow's steps as a chain of cards -- who approves,
 * what is checked, what runs -- edits one at a time in the panel beside it, and publishes the chain as the next version.
 * The server checks the steps (WorkflowSteps) and names each problem where it is; the designer puts it on its card.
 * Running requests keep the version they started with. A test run starts a request as the administrator and opens it.
 * Everyone else with the page reads the workflows but changes nothing.
 */
@Component({
  selector: 'app-workflow-designer',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Icon, StatusPill, Combobox, ManagedBanner],
  templateUrl: './workflow-designer.html',
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

  /** The chain being edited; `dirty` once it differs from what was loaded. */
  readonly steps = signal<DraftStep[]>([]);
  readonly dirty = signal(false);
  readonly selected = signal<number | null>(null);
  readonly problems = signal<string[]>([]);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly adding = signal(false);
  readonly view = signal<'steps' | 'history' | 'test' | 'new'>('steps');

  readonly colleagues = signal<Colleague[]>([]);
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

  readonly canEdit = computed(() => this.auth.isTenantAdmin() && !this.auth.builderLocked());

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
    this.api.colleagues().subscribe({ next: r => { if (r.status === API_SUCCESS) this.colleagues.set(r.data ?? []); }, error: () => {} });
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
    this.loadList(this.route.snapshot.queryParamMap.get('key'));
  }

  loadList(open?: string | null): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'Workflows could not be read.'); return; }
        const rows = r.data ?? [];
        this.workflows.set(rows);
        const key = open ?? this.current()?.key ?? rows[0]?.key;
        if (key) this.open(key, true);
        else if (this.canEdit()) this.view.set('new');
      },
      error: () => { this.loading.set(false); this.error.set('Workflows could not be read.'); },
    });
  }

  async choose(key: string): Promise<void> {
    if (key === this.current()?.key && this.view() !== 'new') return;
    if (this.dirty() && !(await confirmWith(this.dialog, { title: 'Leave without publishing?',
      body: 'The changes to these steps are not published and will be lost.', confirmLabel: 'Leave', danger: true }))) return;
    this.open(key);
  }

  open(key: string, quiet = false): void {
    this.api.fetch(key).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { if (!quiet) this.toast.error(r.message || 'That workflow could not be read.'); return; }
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
      error: () => { if (!quiet) this.toast.error('That workflow could not be read.'); },
    });
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

  add(type: StepType): void {
    const step = newStep(type, this.keys());
    const at = this.selected() === null ? this.steps().length : this.selected()! + 1;
    this.steps.update(list => [...list.slice(0, at), step, ...list.slice(at)]);
    this.selected.set(at);
    this.adding.set(false);
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
    this.newName.set('');
    this.newKey.set('');
    this.newDescription.set('');
    this.newSubject.set('request');
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
