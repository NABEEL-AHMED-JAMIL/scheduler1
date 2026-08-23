import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { StorageService } from '../storage.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { DatePipe } from '@angular/common';
import { Icon } from '../../../shared/ui/icon';
import { AudioPlayer } from './audio-player';
import { PdfViewer } from './pdf-viewer';
import { copyText } from '../../../shared/ui/clipboard.util';

export interface PreviewData {
  bucket: string;
  key: string;
  name: string;
  size?: number;
  lastModified?: string;
}

type PreviewKind = 'text' | 'json' | 'markdown' | 'image' | 'pdf' | 'audio' | 'video' | 'none';

const TEXT_LIKE = ['txt', 'csv', 'tsv', 'log', 'xml', 'ndjson'];
const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

@Component({
  selector: 'app-preview-dialog',
  imports: [Icon, DatePipe, AudioPlayer, PdfViewer],
  templateUrl: './preview-dialog.html',
})
export class PreviewDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<PreviewData>(DIALOG_DATA);
  private readonly storage = inject(StorageService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly kind = signal<PreviewKind>('none');
  readonly text = signal('');
  /**
   * Two forms of the same blob. <img>, <audio> and <video> take the plain URL -- a blob: URL
   * is already safe in that context, and a SafeResourceUrl passed through a child component's
   * input is stringified into the attribute instead of being bound, which left the audio
   * element with no source at all. Only the PDF iframe needs the RESOURCE_URL wrapper.
   */
  readonly mediaUrl = signal<string | null>(null);
  readonly frameUrl = signal<SafeResourceUrl | null>(null);
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

  readonly kindIcon = computed(() => {
    switch (this.kind()) {
      case 'image':    return 'eye';
      case 'pdf':      return 'file';
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
      case 'text':     return 'Text';
      case 'image':    return 'Image';
      case 'pdf':      return 'PDF';
      case 'audio':    return 'Audio';
      case 'video':    return 'Video';
      default:         return this.extension() || 'File';
    }
  });

  readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  private objectUrl: string | null = null;

  ngOnInit(): void {
    const extension = this.effectiveExtension(this.data.name);
    this.kind.set(this.kindFor(extension));

    if (this.kind() === 'none') {
      this.loading.set(false);
      return;
    }
    if (this.kind() === 'text' || this.kind() === 'json' || this.kind() === 'markdown') {
      this.loadText();
    } else {
      this.loadMedia();
    }
  }

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
    if (extension === 'md') return 'markdown';
    if (TEXT_LIKE.includes(extension)) return 'text';
    if (IMAGE.includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (['mp3', 'm4a', 'wav'].includes(extension)) return 'audio';
    if (['mp4', 'webm'].includes(extension)) return 'video';
    return 'none';
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
        this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
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

  openInTab(): void {
    window.open(this.storage.downloadUrl(this.data.bucket, this.data.key), '_blank', 'noopener');
  }

  humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  download(): void {
    window.open(this.storage.downloadUrl(this.data.bucket, this.data.key), '_blank');
  }

  close(): void {
    // Blob URLs leak for the life of the document unless released explicitly.
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    // Tells the browser whether the listing's size and modified date are now stale.
    this.ref.close(this.didSave);
  }
}
