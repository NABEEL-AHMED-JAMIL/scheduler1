import {
  Component, DestroyRef, ElementRef, HostListener, OnInit, computed, effect, inject, input, signal, untracked, viewChild, viewChildren,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkDrag, CdkDragDrop, CdkDragMove, CdkDragPreview, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { LoadError } from '../../../shared/ui/load-error';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { confirmWith } from '../../../shared/ui/confirm';
import { HasUnsavedChanges } from '../../../shared/ui/unsaved-changes.guard';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { RsTimePipe } from '../rs-time.pipe';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { InspectResult, Problem, SourceRef, TemplateDefinition, TemplateDetail } from '../report-studio.model';
import { ProblemList } from '../problem-list';
import { PublishData, PublishPanel } from '../template-panels';
import { TestPanel, TestPanelData } from '../test-panel';
import { ApprovalData, ApprovalPanel } from './approval-panel';
import { CanvasDoc, splitCanvas } from './canvas-doc';
import {
  Block, CanvasPage, LayerRow, PX_PER_MM, PaletteEntry, allIds, blockLabel, canHold, cloneWithNewIds, componentsOf, fieldsUsed, find,
  firstRecord, fromPalette, innerPath, insertBlock, layerRows, moveBlock, pageSizeMm, pagesOf, parts, pathsOf, primaryNames, removeBlock,
  rootPathOf, rulerMarks, typeIcon, typeWord, walk, looksLikePicture,
} from './designer-model';
import { PageFrame } from './page-frame';
import { PropChange, PropertiesPanel } from './properties';
import { TestDataChoice, TestDataData, TestDataPanel } from './test-data-panel';
import { AssetCard, UsableProfile } from '../assets.model';

type LeftTab = 'components' | 'layers' | 'data';
type SaveState = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error' | 'readonly';
/** What a drag carries: a palette entry to add, or a block to move. */
type DragData = { add: PaletteEntry } | { move: string };

/** Undo keeps this many steps (the plan's "100 deep"). */
const UNDO_DEPTH = 100;
/** A draft saves this long after the last change. */
const AUTOSAVE_MS = 5000;
/** The canvas draws again this long after a change. */
const DRAW_MS = 300;

/**
 * Report Studio's visual template designer (MIG-404, Figma frame 3, the owner-approved screen 3): the whole width, the
 * sidebar folded to its icons. Left: Components (the palette from the server's registry, the page parts, the pages),
 * Layers and Data (the test data's fields). Centre: the page as the report draws it -- the server's compiler and
 * stylesheet, so preview equals output -- on a millimetre ruler, zoomed, with the selected block outlined and its binding
 * named. Right: the selected block's settings, drawn from the template schema.
 *
 * Every change is an edit of the template's JSON: undo and redo (100 steps), keyboard shortcuts, drag and drop to add and
 * to reorder (on the page and in Layers), and the draft saved five seconds after the last change, optimistic on its
 * revision -- someone else's save in between is a conflict that offers Reload or Save as a copy. The header previews,
 * validates, asks for approval and publishes (report-publish). The test data (pasted JSON, a run's output, an upload or a
 * saved sample) fills the canvas live. The AI suggestion card arrives with phase 6.
 */
@Component({
  selector: 'app-report-designer',
  imports: [Icon, LoadError, ProblemList, PropertiesPanel, PageFrame, FormsModule, RouterLink, UpperCasePipe, CdkDrag, CdkDragPreview, CdkDropList,
    CdkDropListGroup, WorkspaceSelect],
  templateUrl: './designer.html',
  styleUrl: './designer.css',
})
export class ReportDesigner implements OnInit, HasUnsavedChanges {
  readonly templateId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  /** Times as the console writes them: 24-hour, the server's wall clock read as an instant. */
  private readonly clock = new RsTimePipe();

  private readonly workspaces = inject(WorkspaceDirectory);
  /** The one workspace selector (owner #5), first in the header for a platform administrator: picking one goes to its library. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  readonly t = signal<TemplateDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly def = signal<TemplateDefinition | null>(null);
  private revision = 0;
  readonly undoStack = signal<string[]>([]);
  readonly redoStack = signal<string[]>([]);
  private coalesce: { key: string; at: number } | null = null;
  readonly saveState = signal<SaveState>('saved');
  readonly savedAt = signal<string | null>(null);
  readonly saveError = signal('');
  readonly selected = signal<string | null>(null);
  readonly tab = signal<LeftTab>('components');
  readonly search = signal('');
  readonly palette = signal<PaletteEntry[]>([]);
  readonly definitions = signal<Record<string, Record<string, unknown>>>({});
  readonly canvas = signal<CanvasDoc | null>(null);
  readonly drawing = signal(false);
  readonly drawError = signal('');
  readonly problems = signal<Problem[]>([]);
  readonly checkedAt = signal<Date | null>(null);
  readonly showProblems = signal(false);
  readonly records = signal(0);
  readonly testSource = signal<SourceRef | null>(null);
  readonly testRoot = signal('$');
  readonly testLabel = signal('');
  readonly inspect = signal<InspectResult | null>(null);
  readonly zoom = signal(0.75);
  readonly heights = signal<Record<number, number>>({});
  readonly dragging = signal<DragData | null>(null);
  readonly indicator = signal<{ page: number; top: number; left: number; width: number } | null>(null);
  readonly dropInto = signal<{ page: number; id: string } | null>(null);
  readonly overlay = signal<{ page: number; top: number; left: number; width: number; height: number } | null>(null);
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private drawSeq = 0;

  private readonly frames = viewChildren(PageFrame);
  private readonly slots = viewChildren<ElementRef<HTMLElement>>('pageSlot');
  private readonly editor = viewChild<ElementRef<HTMLElement>>('editor');

  readonly zooms = [0.5, 0.75, 1, 1.25, 1.5, 2];
  readonly typeIcon = typeIcon;
  readonly typeWord = typeWord;

  readonly canEditTemplates = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly editable = computed(() => this.canEditTemplates() && !!this.t()?.draft && this.t()?.status !== 'ARCHIVED');
  readonly blocks = computed<Block[]>(() => (this.def() ? componentsOf(this.def()!) : []));
  readonly pages = computed<CanvasPage[]>(() => pagesOf(this.blocks()));
  readonly layers = computed<LayerRow[]>(() => layerRows(this.blocks()));
  readonly types = computed(() => {
    const out: Record<string, string> = {};
    walk(this.blocks(), b => { out[b.id] = b.type; });
    return out;
  });
  readonly selectedBlock = computed<Block | null>(() => {
    const id = this.selected();
    return id ? find(this.blocks(), id)?.block ?? null : null;
  });
  readonly selectedLabel = computed(() => (this.selectedBlock() ? blockLabel(this.selectedBlock()!) : ''));
  readonly selectedBinding = computed(() => {
    const b = this.selectedBlock();
    if (!b) return '';
    const names = this.names();
    const strip = (p: string) => innerPath(p, names) ?? p;
    if (b.type === 'table' && typeof b['dataset'] === 'string') {
      const cols = Array.isArray(b['columns']) ? (b['columns'] as { field?: string }[]).map(c => c.field).filter(Boolean).join(' / ') : '';
      return `${strip(b['dataset'] as string)} → ${cols || 'no columns yet'}`;
    }
    const paths = pathsOf(b).map(strip);
    return paths.length ? paths.slice(0, 3).join(' · ') + (paths.length > 3 ? ' …' : '') : '';
  });
  readonly names = computed(() => (this.def() ? primaryNames(this.def()!) : ['primary']));
  readonly page = computed(() => (this.def() ? pageSizeMm(this.def()!) : { width: 210, height: 297 }));
  readonly pageLabel = computed(() => {
    const p = (this.def()?.template['page'] ?? {}) as { size?: string; orientation?: string };
    return `${p.size ?? 'A4'} · ${p.orientation === 'landscape' ? 'Landscape' : 'Portrait'}`;
  });
  readonly ruler = computed(() => rulerMarks(this.page().width));
  readonly pageWidthPx = computed(() => this.page().width * PX_PER_MM);
  readonly fields = computed(() => fieldsUsed(this.blocks()));
  readonly errors = computed(() => this.problems().filter(p => p.severity === 'ERROR'));
  readonly warnings = computed(() => this.problems().filter(p => p.severity === 'WARNING'));
  readonly structureValid = computed(() => !this.problems().some(p => p.severity === 'ERROR' && (p.stage === 'SCHEMA' || p.stage === 'COMPONENTS')));
  readonly dataFields = computed(() => this.inspect()?.schema ?? []);
  readonly sample = computed(() => firstRecord(this.inspect()));
  readonly dropTargets = computed(() => [...this.pages().map(p => `rsd-page-${p.index}`), 'rsd-layers']);
  readonly paletteGroups = computed(() => {
    const q = this.search().trim().toLowerCase();
    const shown = this.palette().filter(e => e.group !== 'Page' && e.type !== 'column'
      && (!q || e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)));
    const groups: { group: string; entries: PaletteEntry[] }[] = [];
    for (const e of shown) {
      const g = groups.find(x => x.group === e.group) ?? groups[groups.push({ group: e.group, entries: [] }) - 1];
      g.entries.push(e);
    }
    return groups;
  });
  readonly pageParts = computed(() => {
    const p = parts(this.blocks());
    return [
      { key: 'header', label: 'Header', icon: 'layers', id: p.header?.id ?? null },
      { key: 'footer', label: 'Footer', icon: 'layers', id: p.footer?.id ?? null },
      { key: 'pageBreak', label: 'Page break', icon: 'pageBreak', id: null },
    ];
  });
  readonly statusLine = computed(() => {
    const at = this.checkedAt();
    const time = at ? this.clock.transform(at, 'time') ?? '' : '';
    const n = this.fields();
    return `${n} data field${n === 1 ? '' : 's'} used${time ? ' · Checked ' + time : ''}`;
  });
  readonly savedWord = computed(() => {
    switch (this.saveState()) {
      case 'saving': return 'Saving…';
      case 'unsaved': return 'Unsaved changes';
      case 'conflict': return 'Not saved: someone else saved';
      case 'error': return 'Not saved';
      case 'readonly': return this.t()?.draft ? 'Read only' : 'Published versions never change';
      default: return this.savedAt() ? `Saved ${this.savedAt()}` : 'All changes saved';
    }
  });
  readonly approval = computed(() => this.t()?.approval ?? null);
  // MIG-406: the Brand chip and the assets the properties may place (approved; signatures and stamps only this person's to place).
  readonly usableAssets = signal<AssetCard[]>([]);
  readonly profiles = signal<UsableProfile[]>([]);
  readonly templateAssets = computed(() => ((this.def()?.template['assets'] ?? []) as Record<string, unknown>[]));
  readonly branding = computed(() => (this.def()?.template['branding'] ?? {}) as { profileId?: string; disabled?: boolean });
  readonly brandWord = computed(() => {
    const b = this.branding();
    if (b.disabled) return 'No branding';
    const p = b.profileId ? this.profiles().find(x => x.profileId === b.profileId) : this.profiles().find(x => x.isDefault);
    return p ? p.name : b.profileId ? 'A profile not published' : 'None yet';
  });

  constructor() {
    this.destroy.onDestroy(() => {
      if (this.drawTimer) clearTimeout(this.drawTimer);
      if (this.saveTimer) clearTimeout(this.saveTimer);
    });
    // The selection's outline follows the block when the page is drawn again, zoomed or resized.
    effect(() => {
      this.selected();
      this.canvas();
      this.zoom();
      this.heights();
      untracked(() => requestAnimationFrame(() => this.placeOverlay()));
    });
  }

  ngOnInit(): void {
    this.api.schema().subscribe({
      next: s => this.definitions.set(((s as { definitions?: Record<string, Record<string, unknown>> }).definitions) ?? {}),
      error: () => this.definitions.set({}),
    });
    this.api.components().subscribe({ next: list => this.palette.set(list), error: () => this.palette.set([]) });
    this.load();
  }

  toLibrary(): void {
    void this.router.navigate(['/reports/templates']);
  }

  hasUnsavedChanges(): boolean {
    return this.saveState() === 'unsaved' || this.saveState() === 'saving' || this.saveState() === 'conflict' || this.saveState() === 'error';
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  // ---------------------------------------------------------------- loading and saving

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.template(this.templateId()).subscribe({
      next: t => {
        this.t.set(t);
        this.loading.set(false);
        const shown = t.draft ?? t.published;
        this.def.set(shown?.definition ? JSON.parse(JSON.stringify(shown.definition)) as TemplateDefinition : null);
        this.revision = t.draft?.revision ?? 0;
        this.undoStack.set([]);
        this.redoStack.set([]);
        this.saveState.set(this.editable() ? 'saved' : 'readonly');
        this.savedAt.set(t.draft?.updatedAt ? this.hhmm(t.draft.updatedAt) : null);
        if (!this.testSource() && t.samples.length && !this.isPlatformAdmin()) {
          this.testSource.set({ connector: 'SAMPLE', sampleId: t.samples[0].sampleId });
          this.testLabel.set(`Test sample · ${t.samples[0].name}`);
        }
        this.testRoot.set(this.def() ? rootPathOf(this.def()!) : '$');
        this.inspectTestData();
        this.draw(true);
        if (!this.isPlatformAdmin()) {
          this.api.usable(t.templateId).subscribe({
            next: u => { this.usableAssets.set(u.assets); this.profiles.set(u.profiles); },
            error: () => { this.usableAssets.set([]); this.profiles.set([]); },
          });
        }
      },
      error: e => { this.error.set(studioError(e, 'The template could not be read.').message); this.loading.set(false); },
    });
  }

  private hhmm(at: string | Date): string {
    return this.clock.transform(at, 'time') ?? '';
  }

  /** Saves the draft now: optimistic on the revision; a save in between is a conflict, not an overwrite. */
  saveNow(): void {
    const t = this.t();
    const def = this.def();
    if (!t || !def || !this.editable() || this.saveState() === 'saving' || this.saveState() === 'conflict') return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.saveState.set('saving');
    const sent = JSON.stringify(def);
    this.api.saveDraft(t.templateId, this.revision, def).subscribe({
      next: saved => {
        this.revision = saved.draft?.revision ?? this.revision + 1;
        this.t.set({ ...saved, draft: saved.draft ? { ...saved.draft, definition: undefined } : saved.draft });
        this.savedAt.set(this.hhmm(new Date()));
        this.saveError.set('');
        this.saveState.set(JSON.stringify(this.def()) === sent ? 'saved' : 'unsaved');
        if (this.saveState() === 'unsaved') this.scheduleSave();
      },
      error: e => {
        const err = studioError(e, 'The draft could not be saved.');
        this.saveError.set(err.message);
        this.saveState.set(err.code === 'TEMPLATE_CONFLICT' ? 'conflict' : 'error');
        if (err.problems.length) { this.problems.set(err.problems); this.checkedAt.set(new Date()); }
      },
    });
  }

  private scheduleSave(): void {
    if (!this.editable()) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, AUTOSAVE_MS);
  }

  /** The conflict's way out: read the draft as it is now (this tab's changes go). */
  reload(): void {
    void confirmWith(this.dialog, { title: 'Reload the draft?', body: 'The draft as it was last saved opens; the changes here that were not saved are lost.',
      confirmLabel: 'Reload', danger: true }).then(ok => { if (ok) this.load(); });
  }

  /** The conflict's other way out: these changes as a new template, the draft left as the other person saved it. */
  saveAsCopy(): void {
    const t = this.t();
    const def = this.def();
    if (!t || !def) return;
    this.api.create({ from: 'IMPORT', name: `Copy of ${t.name} (${this.hhmm(new Date())})`, definition: def }).subscribe({
      next: made => {
        this.saveState.set('saved');
        this.toast.success('Your changes are a new template now; the original draft is as the other person saved it.');
        void this.router.navigate(['/reports/templates', made.templateId, 'design']);
      },
      error: e => this.toast.error(studioError(e, 'The copy could not be made.').message),
    });
  }

  /** A published template has no draft: the designer starts one from the newest version. */
  startDraft(): void {
    const t = this.t();
    if (!t?.currentPublishedVersion) return;
    this.api.newDraft(t.templateId, t.currentPublishedVersion).subscribe({
      next: () => { this.toast.success(`A new draft from v${t.currentPublishedVersion}.`); this.load(); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  // ---------------------------------------------------------------- editing

  /**
   * One edit: the change made to a copy of the template, the copy before it on the undo stack (typing in one setting is
   * one step), the canvas drawn again and the draft saved soon.
   */
  edit(change: (blocks: Block[], def: TemplateDefinition) => boolean | void, coalesceKey?: string): boolean {
    const before = this.def();
    if (!before || !this.editable()) return false;
    const next = JSON.parse(JSON.stringify(before)) as TemplateDefinition;
    if (change(componentsOf(next), next) === false) return false;
    const now = Date.now();
    const merge = coalesceKey && this.coalesce?.key === coalesceKey && now - this.coalesce.at < 1500;
    if (!merge) {
      this.undoStack.update(s => [...s.slice(-(UNDO_DEPTH - 1)), JSON.stringify(before)]);
    }
    this.coalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
    this.redoStack.set([]);
    this.def.set(next);
    this.changed();
    return true;
  }

  private changed(): void {
    this.saveState.set('unsaved');
    this.scheduleSave();
    this.draw();
  }

  undo(): void {
    const stack = this.undoStack();
    const def = this.def();
    if (!stack.length || !def || !this.editable()) return;
    this.redoStack.update(r => [...r, JSON.stringify(def)]);
    this.def.set(JSON.parse(stack[stack.length - 1]) as TemplateDefinition);
    this.undoStack.set(stack.slice(0, -1));
    this.coalesce = null;
    if (this.selected() && !find(this.blocks(), this.selected()!)) this.selected.set(null);
    this.changed();
  }

  redo(): void {
    const stack = this.redoStack();
    const def = this.def();
    if (!stack.length || !def || !this.editable()) return;
    this.undoStack.update(u => [...u, JSON.stringify(def)]);
    this.def.set(JSON.parse(stack[stack.length - 1]) as TemplateDefinition);
    this.redoStack.set(stack.slice(0, -1));
    this.coalesce = null;
    this.changed();
  }

  /** A setting of the selected block changed in the properties panel. */
  setProperty(change: PropChange): void {
    const id = this.selected();
    if (!id) return;
    this.edit(blocks => {
      const at = find(blocks, id);
      if (!at) return false;
      if (change.value === undefined) delete at.block[change.key];
      else at.block[change.key] = change.value;
      return true;
    }, `${id}:${change.key}`);
  }

  /** MIG-406: the Brand chip -- the workspace default (no profile named), a named profile, or no branding. */
  setBrand(choice: string): void {
    this.edit((_blocks, def) => {
      if (!choice) delete def.template['branding'];
      else if (choice === 'off') def.template['branding'] = { disabled: true };
      else def.template['branding'] = { profileId: choice };
      return true;
    });
  }

  /**
   * MIG-406: a library asset picked in the properties: the template's asset entry for it (added once, named after its
   * number) and the selected block pointing at it. The server pins the version on save and checks this person may place it.
   */
  pickAsset(pick: { key: string; assetId: string | null }): void {
    const id = this.selected();
    if (!id) return;
    const asset = pick.assetId ? this.usableAssets().find(a => a.assetId === pick.assetId) : null;
    this.edit((blocks, def) => {
      const at = find(blocks, id);
      if (!at) return false;
      if (!asset) { delete at.block[pick.key]; return true; }
      const entries = ((def.template['assets'] ?? []) as Record<string, unknown>[]).slice();
      const purpose = asset.kind === 'SIGNATURE' ? 'signature' : asset.kind === 'STAMP' ? 'stamp' : asset.kind === 'LOGO' ? 'logo' : 'image';
      let entry = entries.find(e => e['assetRef'] === asset.assetId);
      if (!entry) {
        entry = { id: `${purpose}-${asset.assetNo}`, purpose, assetRef: asset.assetId, alt: asset.name };
        entries.push(entry);
      }
      def.template['assets'] = entries;
      at.block[pick.key] = entry['id'];
      return true;
    }, `${id}:${pick.key}`);
  }

  /** Whether a data field reads like a picture's key (the Data tab offers "show as image"). */
  looksLikeImage(path: string, type: string): boolean {
    return looksLikePicture(path, type, this.inspect()?.sample ?? []);
  }

  /**
   * MIG-406: "show as image" -- a field naming a picture becomes an image block bound to it, or, when it is a field of
   * each item of a list, an image grid over that list. The pictures come from the test data's bucket when it is a bucket
   * file, else the bucket is asked for in the properties.
   */
  showAsImage(path: string): void {
    const src = this.testSource();
    // A bucket file's bucket; of several files, the first that is a bucket file's.
    const files = src?.connector === 'BUNDLE' ? Object.values(src.parts) : src ? [src] : [];
    const bucketFile = files.find(f => f.connector === 'BUCKET_OBJECT') as { bucket?: string } | undefined;
    const bucket = bucketFile?.bucket ?? '';
    const name = this.names()[0];
    const list = path.includes('[]') ? path.slice(0, path.indexOf('[]')) : null;
    const entry = list
      ? { type: 'imageGrid', group: 'Media', label: 'Image grid', description: '', defaults: { binding: `${name}.${list}`, imageField: path.slice(path.indexOf('[]') + 3) || 'image',
        columns: 3, missing: 'placeholder', imageSource: { kind: 'BUCKET', bucket } } }
      : { type: 'image', group: 'Media', label: 'Image from data', description: '', defaults: { binding: `${name}.${path}`, width: '60mm', missing: 'placeholder',
        alt: path, imageSource: { kind: 'BUCKET', bucket } } };
    this.add(entry as PaletteEntry);
    if (!bucket) this.toast.info('Say which bucket the pictures are in: Data › Pictures from, in the properties.');
  }

  /** Adds a palette entry: after the selected block (or into it, when it is a container that may hold it), else at the end. */
  add(entry: PaletteEntry): void {
    let made: Block | null = null;
    this.edit(blocks => {
      made = fromPalette(entry, allIds(blocks));
      const sel = this.selected() ? find(blocks, this.selected()!) : null;
      if (sel && canHold(sel.block, made) && (sel.block.type === 'section' || sel.block.type === 'column')) {
        return insertBlock(blocks, sel.block.id, sel.block.children?.length ?? 0, made);
      }
      if (sel && canHold(sel.parent, made)) return insertBlock(blocks, sel.parent?.id ?? null, sel.index + 1, made);
      const footerAt = blocks.findIndex(b => b.type === 'section' && b['role'] === 'footer');
      return insertBlock(blocks, null, footerAt >= 0 ? footerAt : blocks.length, made);
    });
    if (made) this.selected.set((made as Block).id);
  }

  /** The page parts: a header or footer (one each; an existing one is selected), or a page break after the selection. */
  addPart(key: string): void {
    const part = this.pageParts().find(p => p.key === key);
    if (part?.id) { this.select(part.id); return; }
    const entry = this.palette().find(e => e.type === (key === 'pageBreak' ? 'pageBreak' : 'section')
      && (key === 'pageBreak' || (e.defaults as { role?: string })['role'] === key));
    if (!entry) return;
    if (key === 'pageBreak') { this.add(entry); return; }
    let made: Block | null = null;
    this.edit(blocks => {
      made = fromPalette(entry, allIds(blocks));
      return insertBlock(blocks, null, key === 'header' ? 0 : blocks.length, made);
    });
    if (made) this.selected.set((made as Block).id);
  }

  /** A new page: a page break and a heading at the end of the body. */
  addPage(): void {
    const breakEntry = this.palette().find(e => e.type === 'pageBreak');
    const heading = this.palette().find(e => e.type === 'heading');
    if (!breakEntry || !heading) return;
    let titleId = '';
    this.edit(blocks => {
      const ids = allIds(blocks);
      const footerAt = blocks.findIndex(b => b.type === 'section' && b['role'] === 'footer');
      const at = footerAt >= 0 ? footerAt : blocks.length;
      const title = fromPalette(heading, ids);
      title['content'] = `Page ${this.pages().length + 1}`;
      titleId = title.id;
      return insertBlock(blocks, null, at, fromPalette(breakEntry, ids)) && insertBlock(blocks, null, at + 1, title);
    });
    if (titleId) this.select(titleId);
  }

  removeSelected(): void {
    const id = this.selected();
    if (!id) return;
    const at = find(this.blocks(), id);
    const next = at ? (at.list[at.index + 1] ?? at.list[at.index - 1] ?? at.parent) : null;
    if (this.edit(blocks => removeBlock(blocks, id))) this.selected.set(next?.id ?? null);
  }

  duplicateSelected(): void {
    const id = this.selected();
    if (!id) return;
    let copyId = '';
    this.edit(blocks => {
      const at = find(blocks, id);
      if (!at || (at.block.type === 'section' && at.block['role'] !== 'body' && at.block['role'] !== undefined)) return false;
      const copy = cloneWithNewIds(at.block, allIds(blocks));
      copyId = copy.id;
      at.list.splice(at.index + 1, 0, copy);
      return true;
    });
    if (copyId) this.selected.set(copyId);
  }

  /** Moves the selected block one place up or down among its siblings. */
  nudge(by: -1 | 1): void {
    const id = this.selected();
    if (!id) return;
    this.edit(blocks => {
      const at = find(blocks, id);
      if (!at) return false;
      const to = at.index + by;
      if (to < 0 || to >= at.list.length) return false;
      return moveBlock(blocks, id, at.parent?.id ?? null, by > 0 ? to + 1 : to);
    });
  }

  /** Selects the block before or after the selected one, in the order Layers shows. */
  step(by: -1 | 1): void {
    const rows = this.layers();
    if (!rows.length) return;
    const i = rows.findIndex(r => r.id === this.selected());
    const next = rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + by))];
    this.select(next.id);
  }

  select(id: string | null): void {
    this.selected.set(id);
    if (id) requestAnimationFrame(() => this.scrollToSelected());
  }

  private scrollToSelected(): void {
    const o = this.overlay();
    const slot = o ? this.slots()[o.page]?.nativeElement : null;
    const box = slot?.querySelector('.rsd-selection') as HTMLElement | null;
    box?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); this.saveNow(); return; }
    if (typing || !this.def() || this.dialog.openDialogs.length) return;
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); this.undo(); return; }
    if (mod && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) { event.preventDefault(); this.redo(); return; }
    if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicateSelected(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected()) { event.preventDefault(); this.removeSelected(); return; }
    if (event.key === 'Escape') { this.selected.set(null); return; }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const by = event.key === 'ArrowUp' ? -1 : 1;
      if (event.altKey) this.nudge(by); else this.step(by);
    }
  }

  // ---------------------------------------------------------------- the canvas

  /** Draws the canvas from the template as it stands, soon (or now): the server's compiler, the test data in it. */
  draw(now = false): void {
    if (this.drawTimer) clearTimeout(this.drawTimer);
    this.drawTimer = setTimeout(() => this.drawNow(), now ? 0 : DRAW_MS);
  }

  private drawNow(): void {
    const def = this.def();
    if (!def) return;
    const seq = ++this.drawSeq;
    this.drawing.set(true);
    const body: Record<string, unknown> = { definition: def };
    if (this.testSource()) { body['source'] = this.testSource(); body['rootPath'] = this.testRoot(); }
    this.api.canvas(body).subscribe({
      next: r => {
        if (seq !== this.drawSeq) return;
        this.drawing.set(false);
        this.drawError.set('');
        this.problems.set(r.problems ?? []);
        this.records.set(r.records ?? 0);
        if (r.label) this.testLabel.set(r.label);
        this.checkedAt.set(new Date());
        if (r.html) this.canvas.set(splitCanvas(r.html));
        if (!this.fitted) { this.fitted = true; requestAnimationFrame(() => this.fitIfWider()); }
      },
      error: e => {
        if (seq !== this.drawSeq) return;
        this.drawing.set(false);
        const err = studioError(e, 'The page could not be drawn.');
        this.drawError.set(err.message);
        if (err.problems.length) this.problems.set(err.problems);
      },
    });
  }

  measured(page: number, px: number): void {
    if (this.heights()[page] === px) return;
    this.heights.update(h => ({ ...h, [page]: px }));
  }

  /** A page's height on screen: the sheet's own (at least the paper's), zoomed. */
  slotHeight(page: number): number {
    const paper = this.page().height * PX_PER_MM;
    return Math.max(paper, this.heights()[page] ?? paper) * this.zoom();
  }

  /** The block's outline and its binding, placed over the page it is drawn on. */
  private placeOverlay(): void {
    const id = this.selected();
    if (!id) { this.overlay.set(null); return; }
    const frames = this.frames();
    const slots = this.slots();
    for (let i = 0; i < frames.length; i++) {
      const rect = frames[i].rectOf(id);
      const slot = slots[i]?.nativeElement;
      if (rect && slot && rect.width + rect.height > 0) {
        const base = slot.getBoundingClientRect();
        this.overlay.set({ page: i, top: rect.top - base.top, left: rect.left - base.left, width: rect.width, height: rect.height });
        return;
      }
    }
    this.overlay.set(null);
  }

  pick(id: string | null): void {
    this.selected.set(id);
  }

  zoomBy(by: 1 | -1): void {
    const i = this.zooms.indexOf(this.zoom());
    const next = this.zooms[Math.max(0, Math.min(this.zooms.length - 1, (i < 0 ? 1 : i) + by))];
    this.zoom.set(next);
  }

  private fitted = false;

  /** On opening: a page wider than the canvas at the default zoom is fitted to it (a tablet, a narrow window). */
  private fitIfWider(): void {
    const canvas = this.host.querySelector('.rsd-canvas') as HTMLElement | null;
    if (canvas && this.pageWidthPx() * this.zoom() > canvas.clientWidth - 64) this.fit();
  }

  /** Fits the page's width into the canvas. */
  fit(): void {
    const canvas = this.host.querySelector('.rsd-canvas') as HTMLElement | null;
    if (!canvas) return;
    const fitted = Math.max(0.4, Math.min(2, (canvas.clientWidth - 64) / this.pageWidthPx()));
    this.zoom.set(Math.round(fitted * 100) / 100);
  }

  fullScreen(): void {
    const el = this.editor()?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  // ---------------------------------------------------------------- drag and drop

  dragStarted(data: DragData): void {
    this.dragging.set(data);
  }

  dragEnded(): void {
    this.dragging.set(null);
    this.indicator.set(null);
    this.dropInto.set(null);
  }

  /** While a drag is over the canvas: where it would land, as a line (or a container outlined). */
  dragMoved(event: CdkDragMove<DragData>): void {
    const target = this.targetAt(event.pointerPosition.x, event.pointerPosition.y, this.draggedBlock(event.source.data));
    if (!target) { this.indicator.set(null); this.dropInto.set(null); return; }
    this.indicator.set(target.line);
    this.dropInto.set(target.parentId ? { page: target.page, id: target.parentId } : null);
  }

  private draggedBlock(data: DragData): Block {
    if ('add' in data) return { id: 'new', type: data.add.type, ...(data.add.defaults as object) } as Block;
    return find(this.blocks(), data.move)?.block ?? { id: data.move, type: 'text' };
  }

  /** A drop on a page: the palette entry added, or the block moved, where the line showed. */
  dropOnPage(event: CdkDragDrop<unknown, unknown, DragData>): void {
    const data = event.item.data;
    const target = this.targetAt(event.dropPoint.x, event.dropPoint.y, this.draggedBlock(data));
    this.dragEnded();
    if (!target) return;
    this.place(data, target.parentId, target.index);
  }

  /** A drop in Layers: before the row it lands on, as that row's sibling. */
  dropOnLayers(event: CdkDragDrop<unknown, unknown, DragData>): void {
    const data = event.item.data;
    this.dragEnded();
    const rows = this.layers();
    const fromLayers = event.previousContainer === event.container;
    if (fromLayers && event.previousIndex === event.currentIndex) return;
    const at = rows[event.currentIndex];
    if (!at) { this.place(data, null, this.blocks().length); return; }
    const place = find(this.blocks(), at.id);
    if (!place) return;
    const after = fromLayers && event.currentIndex > event.previousIndex;
    this.place(data, place.parent?.id ?? null, place.index + (after ? 1 : 0));
  }

  private place(data: DragData, parentId: string | null, index: number): void {
    if ('add' in data) {
      let made: Block | null = null;
      const ok = this.edit(blocks => {
        made = fromPalette(data.add, allIds(blocks));
        return insertBlock(blocks, parentId, index, made);
      });
      if (ok && made) this.selected.set((made as Block).id);
      else this.toast.info(`${data.add.label} cannot go there.`);
    } else {
      const ok = this.edit(blocks => moveBlock(blocks, data.move, parentId, index));
      if (!ok) this.toast.info('That block cannot go there.');
      this.selected.set(data.move);
    }
  }

  /**
   * Where a block dropped at a point would go: the innermost container under the point that may hold it (a section or a
   * column), else the page's own blocks; the index from the blocks' middles. With the line to draw, in the page's slot.
   */
  private targetAt(x: number, y: number, block: Block): {
    page: number; parentId: string | null; index: number; line: { page: number; top: number; left: number; width: number };
  } | null {
    const frames = this.frames();
    const slots = this.slots();
    const blocks = this.blocks();
    for (let i = 0; i < frames.length; i++) {
      const slot = slots[i]?.nativeElement;
      if (!slot) continue;
      const base = slot.getBoundingClientRect();
      if (x < base.left || x > base.right || y < base.top || y > base.bottom) continue;
      const frame = frames[i];
      let parentId: string | null = null;
      for (const id of frame.idsAt(x, y)) {
        const at = find(blocks, id);
        if (at && (at.block.type === 'section' || at.block.type === 'column' || at.block.type === 'row') && canHold(at.block, block)
          && !(('id' in block) && block.id !== 'new' && id === block.id)) {
          parentId = id;
          break;
        }
      }
      const boxes = frame.childBoxes(parentId).filter(b => b.id !== block.id);
      let before = boxes.findIndex(b => (find(blocks, parentId ?? '')?.block.type === 'row' ? x < b.rect.left + b.rect.width / 2
        : y < b.rect.top + b.rect.height / 2));
      if (before < 0) before = boxes.length;
      let index: number;
      if (parentId) {
        const children = find(blocks, parentId)?.block.children ?? [];
        const ref = boxes[before];
        index = ref ? children.findIndex(c => c.id === ref.id) : children.length;
        if (index < 0) index = children.length;
      } else {
        const page = this.pages()[i];
        const ids = page?.blockIds ?? [];
        const ref = boxes[before]?.id ?? null;
        const anchor = ref ?? (ids.length ? ids[ids.length - 1] : page?.breakId ?? null);
        const anchorAt = anchor ? blocks.findIndex(b => b.id === anchor) : -1;
        if (anchorAt < 0) {
          const footerAt = blocks.findIndex(b => b.type === 'section' && b['role'] === 'footer');
          index = footerAt >= 0 ? footerAt : blocks.length;
        } else {
          index = ref ? anchorAt : anchorAt + 1;
        }
        if (!canHold(null, block)) return null;
      }
      const lineAt = boxes[before]?.rect.top ?? (boxes.length ? boxes[boxes.length - 1].rect.bottom : base.top + 24);
      const holder = parentId ? frame.rectOf(parentId) : null;
      const left = (holder?.left ?? base.left + 8) - base.left;
      const width = holder?.width ?? base.width - 16;
      return { page: i, parentId, index, line: { page: i, top: lineAt - base.top, left, width } };
    }
    return null;
  }

  // ---------------------------------------------------------------- the test data

  openTestData(): void {
    const t = this.t();
    if (!t) return;
    this.dialog.open<TestDataChoice, TestDataData>(TestDataPanel, sidePanelConfig<TestDataData>({
      templateId: t.templateId, samples: t.samples, rootPath: this.testRoot(), canKeep: this.editable(),
    }, 'wide', 'right')).closed.subscribe(choice => {
      if (!choice) return;
      if (choice.kept) this.refreshSamples();
      this.testSource.set(choice.source);
      this.testRoot.set(choice.rootPath);
      this.testLabel.set('');
      this.inspectTestData();
      this.draw(true);
    });
  }

  private refreshSamples(): void {
    this.api.template(this.templateId()).subscribe({
      next: t => this.t.update(cur => (cur ? { ...cur, samples: t.samples } : cur)),
      error: () => { /* the list refreshes on the next load */ },
    });
  }

  /** Reads the test data's schema and first records, for the pickers and the Data tab. */
  private inspectTestData(): void {
    const source = this.testSource();
    if (!source) { this.inspect.set(null); return; }
    this.api.inspect(source, this.testRoot()).subscribe({
      next: r => { this.inspect.set(r); if (r.label) this.testLabel.set(r.label); },
      error: e => { this.inspect.set(null); this.drawError.set(studioError(e, 'The test data could not be read.').message); },
    });
  }

  /** The Data tab: a field clicked binds the selected block to it, or goes into its text as a placeholder. */
  useField(path: string, kind: string): void {
    const b = this.selectedBlock();
    const binding = `${this.names()[0]}.${path}`;
    if (!b || !this.editable()) {
      void navigator.clipboard?.writeText(`{{${binding}}}`);
      this.toast.info(`Copied {{${binding}}}: paste it into a text block.`);
      return;
    }
    const list = /list|array/i.test(kind);
    if (b.type === 'table' && list) this.setProperty({ key: 'dataset', value: binding });
    else if (b.type === 'list' && list) this.setProperty({ key: 'binding', value: binding });
    else if (['heading', 'labelValue'].includes(b.type) || (b.type === 'text' && !b['content'])) this.setProperty({ key: 'binding', value: binding });
    else if (b.type === 'text') this.setProperty({ key: 'content', value: `${b['content'] ?? ''} {{${binding}}}`.trim() });
    else this.toast.info(`${typeWord(b.type)} does not show a data field.`);
  }

  // ---------------------------------------------------------------- page settings (nothing selected)

  readonly pageSizes = ['A4', 'A3', 'A5', 'LETTER', 'LEGAL'];
  readonly marginSides = ['top', 'right', 'bottom', 'left'];
  readonly fonts = ['Noto Sans', 'Noto Serif', 'Noto Sans Mono', 'DejaVu Sans'];
  readonly fontSizes = ['9pt', '9.5pt', '10pt', '10.5pt', '11pt', '12pt'];
  /** The main colour the report's stylesheet uses now (its headings'), for the colour box when the theme names none. */
  readonly primaryDefault = computed(() => /\.rs-h1 \{[^}]*color: (#[0-9A-Fa-f]{6})/.exec(this.canvas()?.css ?? '')?.[1] ?? '');

  pageSetting(key: string): string {
    const page = (this.def()?.template['page'] ?? {}) as Record<string, unknown>;
    return page[key] === undefined ? '' : String(page[key]);
  }

  setPage(key: string, value: string): void {
    this.edit((_blocks, def) => {
      const page = { ...((def.template['page'] ?? {}) as Record<string, unknown>) };
      if (value) page[key] = value; else delete page[key];
      def.template['page'] = page;
      return true;
    }, `page:${key}`);
  }

  margin(side: string): string {
    const m = ((this.def()?.template['page'] as { margins?: Record<string, string> } | undefined)?.margins ?? {})[side];
    return m ? m.replace(/mm$/, '') : '';
  }

  setMargin(side: string, raw: string): void {
    const v = raw.trim().replace(/\s*mm$/, '');
    if (v && !/^\d{1,2}(\.\d)?$/.test(v)) { this.toast.info('A margin is a number of mm, 0 to 99.'); return; }
    this.edit((_blocks, def) => {
      const page = { ...((def.template['page'] ?? {}) as Record<string, unknown>) };
      const margins = { ...((page['margins'] ?? {}) as Record<string, string>) };
      if (v) margins[side] = `${v}mm`; else delete margins[side];
      if (Object.keys(margins).length) page['margins'] = margins; else delete page['margins'];
      def.template['page'] = page;
      return true;
    }, `margin:${side}`);
  }

  themeSetting(key: string): string {
    const theme = (this.def()?.template['theme'] ?? {}) as Record<string, unknown>;
    return theme[key] === undefined ? '' : String(theme[key]);
  }

  setTheme(key: string, value: string): void {
    this.edit((_blocks, def) => {
      const theme = { ...((def.template['theme'] ?? {}) as Record<string, unknown>) };
      if (value) theme[key] = value; else delete theme[key];
      def.template['theme'] = theme;
      return true;
    }, `theme:${key}`);
  }

  // ---------------------------------------------------------------- the header's actions

  preview(): void {
    const t = this.t();
    const def = this.def();
    if (!t || !def) return;
    this.dialog.open<boolean, TestPanelData>(TestPanel, sidePanelConfig<TestPanelData>({
      templateId: t.templateId, title: t.name, version: null, definition: def, samples: t.samples, canKeep: this.editable(),
    }, 'wide', 'right'));
  }

  validate(): void {
    const def = this.def();
    if (!def) return;
    this.api.validate({ definition: def }).subscribe({
      next: r => {
        this.problems.set(r.problems);
        this.checkedAt.set(new Date());
        this.showProblems.set(true);
        if (r.summary.valid) this.toast.success('The template is valid.');
      },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  askApproval(): void {
    const t = this.t();
    if (!t?.draft) return;
    if (this.hasUnsavedChanges()) { this.saveNow(); this.toast.info('Saving the draft first; ask again in a moment.'); return; }
    this.dialog.open<TemplateDetail | undefined, ApprovalData>(ApprovalPanel, sidePanelConfig<ApprovalData>({
      templateId: t.templateId, name: t.name, version: t.draft.version, revision: this.revision,
    }, 'narrow', 'right')).closed.subscribe(done => {
      if (done) { this.t.update(cur => (cur ? { ...cur, approval: done.approval, activity: done.activity } : cur)); }
    });
  }

  publish(): void {
    const t = this.t();
    if (!t?.draft) return;
    if (this.hasUnsavedChanges()) { this.saveNow(); this.toast.info('Saving the draft first; publish again in a moment.'); return; }
    this.dialog.open<TemplateDetail | undefined, PublishData>(PublishPanel, sidePanelConfig<PublishData>({
      templateId: t.templateId, name: t.name, version: t.draft.version, revision: this.revision,
    }, 'narrow', 'right')).closed.subscribe(done => {
      if (done) { this.toast.success(`${t.name} v${t.draft!.version} published.`); this.load(); }
    });
  }
}
