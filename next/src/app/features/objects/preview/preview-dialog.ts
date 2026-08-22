import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { StorageService } from '../storage.service';

export interface PreviewData {
  bucket: string;
  key: string;
  name: string;
}

type PreviewKind = 'text' | 'json' | 'markdown' | 'image' | 'pdf' | 'audio' | 'video' | 'none';

const TEXT_LIKE = ['txt', 'csv', 'tsv', 'log', 'xml', 'ndjson'];
const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

@Component({
  selector: 'app-preview-dialog',
  templateUrl: './preview-dialog.html',
})
export class PreviewDialog implements OnInit {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<PreviewData>(DIALOG_DATA);
  private readonly storage = inject(StorageService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly kind = signal<PreviewKind>('none');
  readonly text = signal('');
  readonly mediaUrl = signal<SafeResourceUrl | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

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
        this.mediaUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load this file.');
      },
    });
  }

  download(): void {
    window.open(this.storage.downloadUrl(this.data.bucket, this.data.key), '_blank');
  }

  close(): void {
    // Blob URLs leak for the life of the document unless released explicitly.
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.ref.close();
  }
}
