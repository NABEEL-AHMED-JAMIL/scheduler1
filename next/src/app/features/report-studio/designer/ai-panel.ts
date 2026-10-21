import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Icon } from '../../../shared/ui/icon';
import { studioError } from '../report-studio.api';
import { AiDataContext, AiDesignerApi, AiStatus, ChangedBlock, Proposal, ProposalKind, refusedProposal } from '../ai-designer.api';
import { Problem } from '../report-studio.model';
import { RsTimePipe } from '../rs-time.pipe';
import { typeWord } from './designer-model';
import { elapsedDuration } from '../../../shared/ui/time-format';

/** One action the AI assistant offers, in the designer's words. */
interface AiAction { kind: ProposalKind; label: string; hint: string; needsWords: boolean; needsData: boolean; placeholder: string; }

const ACTIONS: AiAction[] = [
  { kind: 'DRAFT_TEMPLATE', label: 'Draft the template', needsWords: true, needsData: false,
    hint: 'Describe the report in plain words: its sections, the values it shows, its tables and charts. The draft replaces the page body; the header and footer stay.',
    placeholder: 'Sections, values, tables and charts the report should have' },
  { kind: 'SUGGEST_MAPPINGS', label: 'Suggest mappings', needsWords: false, needsData: true,
    hint: 'For each field the template reads that the test data does not have, the data\'s matching field, with how sure the AI is.', placeholder: '' },
  { kind: 'SUGGEST_CHARTS', label: 'Suggest charts', needsWords: false, needsData: true,
    hint: 'One to three charts chosen by the test data\'s field types, added before the footer.', placeholder: 'What the charts should show (optional)' },
  { kind: 'EXPLAIN_VALIDATION', label: 'Explain the checks', needsWords: false, needsData: false,
    hint: 'The checks\' problems in plain words, with a fix to apply where one reads a field the data has.', placeholder: '' },
  { kind: 'DRAFT_TEXT', label: 'Write a paragraph', needsWords: true, needsData: false,
    hint: 'A short paragraph of the data\'s own values, placed after the selected block and labelled "Drafted with AI".',
    placeholder: 'What the paragraph should say' },
];

/**
 * The designer's AI assistant (Report Studio phase 6; Figma frame 3's card): it proposes, the person decides. A proposal
 * is shown as a list of changes and, on request, on the page itself (added blocks outlined); "Accept" checks it again on
 * the draft as it is now and the designer applies it as one undo step and saves the draft; "Dismiss" drops it. Nothing
 * changes the draft by itself, and a proposal made on an older revision of the draft can no longer be accepted.
 *
 * Only the test data's fields and types are sent, unless the person ticks "include sample values" (at most 20 records,
 * identifying values and free text masked by the service, and only when the workspace's data policy allows the model).
 */
@Component({
  selector: 'app-rs-ai-panel',
  imports: [FormsModule, Icon, RsTimePipe],
  templateUrl: './ai-panel.html',
  styleUrl: './ai-panel.css',
})
export class AiPanel {
  readonly templateId = input.required<string>();
  readonly version = input.required<number>();
  readonly revision = input.required<number>();
  readonly editable = input(false);
  /** The designer's save state: a proposal is asked for on the saved draft only. */
  readonly saveState = input('saved');
  /** The test data's fields and first records (the Data tab's). */
  readonly data = input<AiDataContext | null>(null);
  /** The checks the designer shows now (the canvas checks the data too). */
  readonly problems = input<Problem[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly selectedLabel = input('');
  /** Whether the designer still shows the proposal on the page (an edit there puts the draft back). */
  readonly shown = input(false);
  /** Show this proposal's patch on the page (null: the draft as it is). */
  readonly preview = output<Proposal | null>();
  /** Accepted: the designer applies the patch as one undo step and saves. */
  readonly apply = output<Proposal>();
  /** Save the draft first (there are unsaved changes). */
  readonly save = output<void>();

  private readonly api = inject(AiDesignerApi);
  readonly actions = ACTIONS;
  readonly status = signal<AiStatus | null>(null);
  readonly kind = signal<ProposalKind>('DRAFT_TEMPLATE');
  readonly words = signal('');
  readonly includeValues = signal(false);
  readonly busy = signal(false);
  readonly deciding = signal(false);
  readonly error = signal('');
  readonly proposal = signal<Proposal | null>(null);
  readonly previewing = signal(false);
  readonly history = signal<Proposal[]>([]);
  readonly elapsed = signal(0);
  /** The counter while the model drafts: "45 sec", "2 min 05 sec". */
  elapsedText(): string { return elapsedDuration(this.elapsed()); }
  private timer: ReturnType<typeof setInterval> | null = null;
  private call: Subscription | null = null;

  readonly action = computed(() => ACTIONS.find(a => a.kind === this.kind())!);
  readonly hasData = computed(() => (this.data()?.fields.length ?? 0) > 0);
  readonly canAsk = computed(() => this.editable() && !!this.status()?.available && !this.busy()
    && (!this.action().needsWords || this.words().trim().length > 0) && (!this.action().needsData || this.hasData()));
  readonly why = computed(() => {
    if (!this.editable()) return 'The AI helps with a draft you can edit.';
    if (this.status() && !this.status()!.available) return this.status()!.reason ?? 'No model can answer in this workspace now.';
    if (this.action().needsData && !this.hasData()) return 'Pick test data first (Test data, in the toolbar).';
    return '';
  });
  readonly changes = computed(() => {
    const c = this.proposal()?.changes ?? {};
    return { added: c.added ?? [], changed: c.changed ?? [], removed: c.removed ?? [], template: c.template ?? [] };
  });
  readonly stale = computed(() => {
    const p = this.proposal();
    return !!p && p.state === 'PROPOSED' && (p.baseRevision !== this.revision() || p.baseVersion !== this.version());
  });
  readonly typeWord = typeWord;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.stopTimer(); this.call?.unsubscribe(); });
    this.api.status().subscribe({ next: s => this.status.set(s), error: e => this.status.set({ available: false, reason: studioError(e).message }) });
    effect(() => {
      const id = this.templateId();
      untracked(() => this.api.proposals(id, 8).subscribe({ next: list => this.history.set(list), error: () => this.history.set([]) }));
    });
    // A draft saved since the proposal: its preview is no longer the draft's, so it goes.
    effect(() => { if (this.stale() && this.previewing()) untracked(() => this.togglePreview(false)); });
    // An edit on the page put the draft back: the button says so too.
    effect(() => { if (!this.shown() && untracked(() => this.previewing())) this.previewing.set(false); });
  }

  choose(kind: ProposalKind): void {
    this.kind.set(kind);
    this.error.set('');
  }

  ask(): void {
    if (!this.canAsk()) return;
    if (this.saveState() !== 'saved') {
      this.save.emit();
      this.error.set(this.saveState() === 'saving' ? 'Saving the draft first; ask again in a moment.' : 'Save the draft first: the AI works on the saved draft.');
      return;
    }
    const data = this.data();
    const body = {
      templateId: this.templateId(), version: this.version(), revision: this.revision(), instruction: this.words().trim() || undefined,
      data: data && data.fields.length ? { ...data, records: this.includeValues() ? data.records : undefined, includeValues: this.includeValues() } : null,
      problems: this.kind() === 'EXPLAIN_VALIDATION' ? this.problems() : undefined,
      afterComponentId: this.kind() === 'DRAFT_TEXT' ? this.selectedId() : undefined,
    };
    this.togglePreview(false);
    this.busy.set(true);
    this.error.set('');
    this.proposal.set(null);
    this.startTimer();
    this.call = this.api.propose(this.kind(), body).subscribe({
      next: p => { this.busy.set(false); this.stopTimer(); this.proposal.set(p); this.remember(p); },
      error: e => { this.busy.set(false); this.stopTimer(); this.error.set(studioError(e, 'The AI could not answer; try again.').message); },
    });
  }

  cancel(): void {
    this.call?.unsubscribe();
    this.busy.set(false);
    this.stopTimer();
  }

  togglePreview(on = !this.previewing()): void {
    const p = this.proposal();
    const show = on && !!p && p.state === 'PROPOSED' && p.patch.length > 0 && !this.stale();
    if (show === this.previewing()) return;
    this.previewing.set(show);
    this.preview.emit(show ? p : null);
  }

  accept(): void {
    const p = this.proposal();
    if (!p || this.deciding()) return;
    this.deciding.set(true);
    this.error.set('');
    this.api.accept(p.proposalId, this.version(), this.revision()).subscribe({
      next: done => {
        this.deciding.set(false);
        this.togglePreview(false);
        this.proposal.set(done);
        this.remember(done);
        this.apply.emit(done);
      },
      error: e => {
        this.deciding.set(false);
        this.togglePreview(false);
        const now = refusedProposal(e);
        if (now) { this.proposal.set(now); this.remember(now); }
        this.error.set(studioError(e, 'The proposal could not be accepted.').message);
      },
    });
  }

  dismiss(): void {
    const p = this.proposal();
    if (!p || this.deciding()) return;
    this.deciding.set(true);
    this.api.dismiss(p.proposalId).subscribe({
      next: done => { this.deciding.set(false); this.togglePreview(false); this.proposal.set(null); this.remember(done); },
      error: e => {
        this.deciding.set(false);
        const now = refusedProposal(e);
        if (now) { this.proposal.set(now); this.remember(now); }
        this.error.set(studioError(e).message);
      },
    });
  }

  open(p: Proposal): void {
    this.togglePreview(false);
    this.proposal.set(p);
    this.error.set('');
  }

  kindWord(kind: ProposalKind): string {
    return ACTIONS.find(a => a.kind === kind)?.label ?? kind;
  }

  stateWord(p: Proposal): string {
    if (p.state === 'PROPOSED') return this.stale() && p === this.proposal() ? 'Out of date' : 'Proposed';
    return { ACCEPTED: 'Accepted', DISMISSED: 'Dismissed', INVALID: 'Not valid' }[p.state];
  }

  stateClass(p: Proposal): string {
    return { PROPOSED: 'pill-info', ACCEPTED: 'pill-ok', DISMISSED: 'pill-neutral', INVALID: 'pill-crit' }[p.state];
  }

  percent(n: number | undefined): string {
    return n === undefined || n === null ? '' : `${Math.round(n * 100)} %`;
  }

  blockWord(b: ChangedBlock): string {
    return `${typeWord(b.type)}${b.label ? ' · ' + b.label : ''}`;
  }

  private remember(p: Proposal): void {
    this.history.update(list => [p, ...list.filter(x => x.proposalId !== p.proposalId)].slice(0, 8));
  }

  private startTimer(): void {
    this.elapsed.set(0);
    const started = Date.now();
    this.timer = setInterval(() => this.elapsed.set(Math.round((Date.now() - started) / 1000)), 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
