import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ArchiveEntry, StorageService, TablePreview } from '../storage.service';
import { API_SUCCESS } from '../../../core/api/api.config';

import { Icon } from '../../../shared/ui/icon';
import { AudioPlayer } from './audio-player';
import { PdfViewer } from './pdf-viewer';
import { copyText } from '../../../shared/ui/clipboard.util';
import { formatSize } from '../../../shared/ui/format-size';
import { catchError } from 'rxjs';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';

export interface PreviewData {
  bucket: string;
  key: string;
  name: string;
  size?: number;
  lastModified?: string;
}

/**
 * What the viewer draws, decided by the shape of the data rather than by the name alone:
 * a table for anything with rows and columns, a PDF for anything the server can render to
 * one, the entries of an archive, and -- for a name nobody registered -- a look at the bytes,
 * shown as text when they are text and as a hex glance when they are not.
 */
type PreviewKind = 'text' | 'json' | 'markdown' | 'table' | 'document' | 'archive' | 'image' | 'pdf' | 'audio' | 'video' | 'sniff' | 'binary' | 'none';

/** Read as text and shown as code: the config, the log, the source a bucket fills up with. */
const TEXT_LIKE = ['txt', 'log', 'xml', 'yaml', 'yml', 'properties', 'ini', 'toml', 'env', 'conf', 'cfg', 'sql',
  'html', 'htm', 'css', 'js', 'ts', 'py', 'sh', 'java', 'rb', 'go', 'rs', 'php', 'xsl', 'xsd', 'svg-source', 'srt', 'vtt'];
/** Rows and columns: read through previewTable. */
const TABULAR = ['csv', 'tsv', 'psv', 'xlsx', 'xlsm', 'xls', 'parquet', 'jsonl', 'ndjson'];
/** The converter's families minus the tables: rendered to PDF on the server. */
const DOCUMENT = ['doc', 'docx', 'dotx', 'odt', 'ott', 'fodt', 'rtf', 'sxw', 'wpd', 'ppt', 'pptx', 'potx', 'odp', 'otp', 'fodp', 'sxi',
  'ods', 'ots', 'fods', 'sxc', 'xltx', 'odg', 'otg', 'fodg', 'vsd', 'vsdx', 'xhtml'];
const ARCHIVE = ['zip', 'jar'];
const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];
const AUDIO = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac', 'weba'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];

@Component({
  selector: 'app-preview-dialog',
  imports: [Icon, ServerTimePipe, AudioPlayer, PdfViewer],
  templateUrl: './preview-dialog.html',
})
export class PreviewDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<PreviewData>(DIALOG_DATA);
  private readonly storage = inject(StorageService);

  readonly kind = signal<PreviewKind>('none');
  readonly text = signal('');
  /**
   * <img>, <audio> and <video> take the plain blob: URL, which is already safe in those
   * contexts. There was a second SafeResourceUrl form here for an iframe that no longer
   * exists -- the PDF viewer draws to a canvas instead -- so it was a standing sanitizer
   * bypass with no caller. A blob: URL inherits this origin, so framing one built from an
   * uploaded .html would run that file's script against the session; removing the unused
   * bypass keeps that from being one binding away.
   */
  readonly mediaUrl = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly zoom = signal(1);
  readonly copied = signal(false);
  readonly editing = signal(false);
  readonly draft = signal('');
  readonly saving = signal(false);
  private didSave = false;

  readonly extension = computed(() => this.extensionOf(this.data.name));

  readonly isTextual = computed(() =>
    ['text', 'json', 'markdown'].includes(this.kind()));

  // ---- tables ----
  readonly table = signal<TablePreview | null>(null);
  readonly tableOffset = signal(0);
  readonly tableLimit = 100;
  readonly tableSearch = signal('');
  readonly tableLoading = signal(false);
  /** Rows on the page that match the search, with their absolute row number. */
  readonly tableRows = computed(() => {
    const t = this.table();
    if (!t) return [];
    const q = this.tableSearch().trim().toLowerCase();
    return t.rows.map((cells, i) => ({ n: t.offset + i + 1, cells }))
      .filter(r => !q || r.cells.some(c => c.toLowerCase().includes(q)));
  });
  readonly tableLast = computed(() => { const t = this.table(); return t ? t.offset + t.rows.length : 0; });
  readonly tableHasMore = computed(() => { const t = this.table(); return !!t && (t.totalRows < 0 ? t.rows.length === t.limit : this.tableLast() < t.totalRows); });
  readonly tableTotalLabel = computed(() => {
    const t = this.table();
    if (!t) return '';
    return t.totalRows < 0 ? `${this.tableLast().toLocaleString()}+ rows` : `${t.totalRows.toLocaleString()} row${t.totalRows === 1 ? '' : 's'}`;
  });

  // ---- archives ----
  readonly entries = signal<ArchiveEntry[]>([]);
  readonly entrySearch = signal('');
  readonly visibleEntries = computed(() => {
    const q = this.entrySearch().trim().toLowerCase();
    return this.entries().filter(e => !q || e.name.toLowerCase().includes(q));
  });
  readonly archiveTotal = computed(() => this.entries().filter(e => !e.directory).reduce((n, e) => n + Math.max(0, e.size), 0));

  /** For a file nobody registered: the first bytes, as hex, when they were not text. */
  readonly hex = signal('');
  /** The language label under the name, for a text kind. */
  readonly language = computed(() => {
    const ext = this.effectiveExtension(this.data.name);
    const names: Record<string, string> = { yml: 'YAML', yaml: 'YAML', sql: 'SQL', html: 'HTML', htm: 'HTML', xml: 'XML', log: 'Log',
      properties: 'Properties', ini: 'INI', toml: 'TOML', env: 'Environment', conf: 'Config', cfg: 'Config', css: 'CSS', js: 'JavaScript',
      ts: 'TypeScript', py: 'Python', sh: 'Shell', java: 'Java', txt: 'Text', srt: 'Subtitles', vtt: 'Subtitles' };
    return names[ext] ?? (ext ? ext.toUpperCase() : 'Text');
  });

  readonly kindIcon = computed(() => {
    switch (this.kind()) {
      case 'image':    return 'eye';
      case 'table':    return 'table';
      case 'archive':  return 'folder';
      case 'pdf':
      case 'document': return 'file';
      case 'audio':    return 'volume';
      case 'video':    return 'play';
      case 'json':
      case 'markdown':
      case 'text':     return 'file';
      default:         return 'file';
    }
  });

  readonly kindLabel = computed(() => {
    switch (this.kind()) {
      case 'json':     return 'JSON';
      case 'markdown': return 'Markdown';
      case 'text':     return this.language();
      case 'table':    return this.table()?.source === 'xlsx' ? 'Workbook' : this.table()?.source === 'parquet' ? 'Parquet' : this.table()?.source === 'jsonl' ? 'JSON lines' : 'Table';
      case 'document': return (this.extension() || 'document').toUpperCase() + ' · rendered';
      case 'archive':  return 'Archive';
      case 'image':    return 'Image';
      case 'pdf':      return 'PDF';
      case 'audio':    return 'Audio';
      case 'video':    return 'Video';
      case 'binary':   return (this.extension() || 'binary').toUpperCase() + ' · binary';
      default:         return this.extension() || 'File';
    }
  });

  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  private objectUrl: string | null = null;

  ngOnInit(): void {
    const extension = this.effectiveExtension(this.data.name);
    this.kind.set(this.kindFor(extension));

    switch (this.kind()) {
      case 'none': this.loading.set(false); return;
      case 'text': case 'markdown': this.loadText(); return;
      // JSON is a table when it is a list of records, and text otherwise; ask, then decide.
      case 'json': this.loadTable(0, undefined, () => { this.kind.set('json'); this.loadText(); }); return;
      case 'table': this.loadTable(0); return;
      case 'document': this.loadDocument(); return;
      case 'archive': this.loadArchive(); return;
      case 'sniff': this.sniff(); return;
      default: this.loadMedia();
    }
  }

  /**
   * A page of the table. `orElse` is what to do when the server says this is not a table
   * after all -- only JSON needs it, since a JSON file is a list of records or it is not.
   */
  private loadTable(offset: number, sheet?: string, orElse?: () => void): void {
    this.tableLoading.set(true);
    this.storage.previewTable(this.data.bucket, this.data.key, offset, this.tableLimit, sheet ?? this.table()?.sheet).subscribe({
      next: r => {
        this.tableLoading.set(false);
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) {
          if (orElse) { orElse(); return; }
          this.error.set(r.message || 'Could not read this file as a table.');
          return;
        }
        this.kind.set('table');
        this.table.set(r.data);
        this.tableOffset.set(r.data.offset);
      },
      error: err => {
        this.tableLoading.set(false);
        this.loading.set(false);
        if (orElse) { orElse(); return; }
        this.error.set(err?.error?.message || 'Could not read this file as a table.');
      },
    });
  }

  tablePage(direction: 1 | -1): void {
    const next = Math.max(0, this.tableOffset() + direction * this.tableLimit);
    this.tableSearch.set('');
    this.loadTable(next);
  }

  pickSheet(sheet: string): void {
    this.tableSearch.set('');
    this.loadTable(0, sheet);
  }

  private loadDocument(): void {
    this.storage.previewDocument(this.data.bucket, this.data.key).subscribe({
      next: blob => {
        this.loading.set(false);
        this.objectUrl = URL.createObjectURL(blob);
        this.mediaUrl.set(this.objectUrl);
      },
      error: async err => {
        this.loading.set(false);
        // The refusal comes back as a JSON body on a blob request; read it for the words.
        let message = err?.error?.message;
        if (!message && err?.error instanceof Blob) {
          try { message = JSON.parse(await err.error.text()).message; } catch { /* keep the fallback */ }
        }
        this.error.set(message || 'This document could not be rendered.');
      },
    });
  }

  private loadArchive(): void {
    this.storage.previewArchive(this.data.bucket, this.data.key).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'Could not read this archive.'); return; }
        this.entries.set(r.data ?? []);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read this archive.'); },
    });
  }

  /**
   * A name nobody registered. The first bytes decide: text is shown as text (the rest of the
   * file is then fetched), anything else as a hex glance with a download beside it -- so
   * "no preview" is said with the evidence, not by extension.
   */
  private sniff(): void {
    // The glance is a range request; a store that will not serve one (an FTP adapter, an
    // object with no length) answers with the whole file instead, which decides just as well.
    this.storage.previewHead(this.data.bucket, this.data.key).pipe(
      catchError(() => this.storage.previewBlob(this.data.bucket, this.data.key)),
    ).subscribe({
      next: async blob => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (PreviewDialog.looksLikeText(bytes)) {
          this.kind.set('text');
          this.loadText();
          return;
        }
        this.kind.set('binary');
        this.hex.set(PreviewDialog.hexDump(bytes.subarray(0, 512)));
        this.loading.set(false);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read this file.'); },
    });
  }

  /** Valid UTF-8 with no NUL or stray control bytes, over the sample. Same rule as the server's. */
  static looksLikeText(bytes: Uint8Array): boolean {
    if (!bytes.length) return true;
    for (const b of bytes) {
      if (b === 0 || (b < 0x20 && b !== 9 && b !== 10 && b !== 13 && b !== 12)) return false;
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return true;
    } catch {
      // A cut through a multi-byte character at the sample edge is not binary; try 3 bytes shorter.
      for (let back = 1; back <= 3 && back < bytes.length; back++) {
        try { new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - back)); return true; } catch { /* next */ }
      }
      return false;
    }
  }

  static hexDump(bytes: Uint8Array): string {
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.subarray(i, i + 16);
      const hex = Array.from(chunk, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
      const ascii = Array.from(chunk, b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
      lines.push(`${i.toString(16).padStart(8, '0')}  ${hex}  ${ascii}`);
    }
    return lines.join('\n');
  }

  humanBytes = formatSize;

  /**
   * A .gz is served decompressed by the API and typed by what's inside, so "audit.json.gz"
   * previews as JSON rather than as an unreadable archive.
   */
  private effectiveExtension(name: string): string {
    const extension = this.extensionOf(name);
    if (extension !== 'gz') return extension;
    const inner = this.extensionOf(name.slice(0, -'.gz'.length));
    return inner || 'txt';
  }

  private extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
  }

  private kindFor(extension: string): PreviewKind {
    if (extension === 'json') return 'json';
    if (extension === 'md' || extension === 'markdown') return 'markdown';
    if (TABULAR.includes(extension)) return 'table';
    if (TEXT_LIKE.includes(extension)) return 'text';
    if (IMAGE.includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (DOCUMENT.includes(extension)) return 'document';
    if (ARCHIVE.includes(extension)) return 'archive';
    if (AUDIO.includes(extension)) return 'audio';
    if (VIDEO.includes(extension)) return 'video';
    // Nothing by name: look at the bytes.
    return 'sniff';
  }

  private loadText(): void {
    this.storage.previewText(this.data.bucket, this.data.key).subscribe({
      next: body => {
        this.loading.set(false);
        if (this.kind() === 'json') {
          try {
            this.text.set(JSON.stringify(JSON.parse(body), null, 2));
            return;
          } catch {
            // Not valid JSON after all -- show it raw rather than failing outright.
          }
        }
        this.text.set(body);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not read this file.');
      },
    });
  }

  private loadMedia(): void {
    this.storage.previewBlob(this.data.bucket, this.data.key).subscribe({
      next: blob => {
        this.loading.set(false);
        this.objectUrl = URL.createObjectURL(blob);
        this.mediaUrl.set(this.objectUrl);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load this file.');
      },
    });
  }

  zoomBy(delta: number): void {
    this.zoom.update(z => Math.min(4, Math.max(0.25, Math.round((z + delta) * 100) / 100)));
  }

  resetZoom(): void { this.zoom.set(1); }

  /** Click the image to jump between fit and 2x, which is what people try first. */
  toggleZoom(): void {
    this.zoom.update(z => (z === 1 ? 2 : 1));
  }

  /**
   * Editing writes the file back through uploadObject, which overwrites the key -- the same
   * route the legacy preview used. Only offered for text-like kinds; there is nothing sensible
   * to hand a textarea for an image or a PDF.
   */
  startEdit(): void {
    this.draft.set(this.text());
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  save(): void {
    if (this.saving()) return;
    const text = this.draft();
    const type = this.kind() === 'json' ? 'application/json'
      : this.kind() === 'markdown' ? 'text/markdown' : 'text/plain';

    this.saving.set(true);
    const file = new File([text], this.data.name, { type });
    this.storage.upload(this.data.bucket, this.folderOfKey(), file).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // Re-pretty-print JSON so the saved view matches what a fresh load would show.
        this.text.set(this.kind() === 'json' ? this.prettyJson(text) : text);
        this.editing.set(false);
        this.didSave = true;
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message || 'Could not save this file.');
      },
    });
  }

  /** uploadObject takes the containing folder, not the full key. */
  private folderOfKey(): string {
    const cut = this.data.key.lastIndexOf('/');
    return cut > 0 ? this.data.key.slice(0, cut + 1) : '';
  }

  private prettyJson(text: string): string {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  }

  copy(): void {
    copyText(this.text()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  retry(): void {
    this.error.set('');
    this.loading.set(true);
    this.zoom.set(1);
    this.ngOnInit();
  }

  /** Opens the already-fetched blob, which needs no token -- the URL would have needed one. */
  openInTab(): void {
    if (this.objectUrl) { window.open(this.objectUrl, '_blank', 'noopener'); return; }
    this.storage.download(this.data.bucket, this.data.key).subscribe({
      next: blob => window.open(URL.createObjectURL(blob), '_blank', 'noopener'),
      error: err => this.error.set(err?.error?.message || 'Could not open this file.'),
    });
  }

  humanSize = formatSize;

  download(): void {
    this.storage.download(this.data.bucket, this.data.key).subscribe({
      next: blob => StorageService.saveBlob(blob, this.data.name),
      error: err => this.error.set(err?.error?.message || 'Could not download this file.'),
    });
  }

  close(): void {
    // Blob URLs leak for the life of the document unless released explicitly.
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    // Tells the browser whether the listing's size and modified date are now stale.
    this.ref.close(this.didSave);
  }
}
