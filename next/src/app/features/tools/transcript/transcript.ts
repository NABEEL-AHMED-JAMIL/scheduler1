import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { BucketSummary, ObjectSummary, StorageService } from '../../objects/storage.service';

const AUDIO_EXTENSIONS = ['mp3', 'm4a'];

@Component({
  selector: 'app-transcript',
  templateUrl: './transcript.html',
})
export class Transcript implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly mode = signal<'upload' | 'bucket'>('upload');
  readonly timestamps = signal(false);
  readonly file = signal<File | null>(null);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal('');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly loadingObjects = signal(false);
  readonly selectedKey = signal('');

  readonly extracting = signal(false);
  readonly transcript = signal('');
  readonly error = signal('');

  readonly audioObjects = computed(() =>
    this.objects().filter(o => !o.folder && AUDIO_EXTENSIONS.some(e => o.name.toLowerCase().endsWith('.' + e))));

  readonly canExtract = computed(() =>
    this.mode() === 'upload' ? !!this.file() : !!this.selectedKey());

  ngOnInit(): void {
    this.storage.buckets().subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.buckets.set(response.data ?? []);
      },
      error: () => { /* upload mode still works without a bucket list */ },
    });
  }

  onBucketChange(value: string): void {
    this.bucket.set(value);
    this.selectedKey.set('');
    this.objects.set([]);
    if (!value) return;
    this.loadingObjects.set(true);
    this.storage.listObjects(value, '', undefined, 200).subscribe({
      next: response => {
        this.loadingObjects.set(false);
        if (response.status === API_SUCCESS) this.objects.set(response.data?.objects ?? []);
      },
      error: () => this.loadingObjects.set(false),
    });
  }

  onFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.transcript.set('');
  }

  extract(): void {
    this.extracting.set(true);
    this.error.set('');
    this.transcript.set('');

    const done = {
      next: (response: ApiResponse<string>) => {
        this.extracting.set(false);
        if (response.status === API_SUCCESS) this.transcript.set(String(response.data ?? ''));
        else this.error.set(response.message);
      },
      error: (err: any) => {
        this.extracting.set(false);
        this.error.set(err?.error?.message || 'The extraction failed.');
      },
    };

    if (this.mode() === 'upload') {
      const file = this.file()!;
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('timestamps', String(this.timestamps()));
      this.http.post<ApiResponse<string>>(`${API_BASE}/audioTranscript.json/extractFromUpload`, form)
        .subscribe(done);
    } else {
      this.http.post<ApiResponse<string>>(`${API_BASE}/audioTranscript.json/extractFromBucket`, {
        bucket: this.bucket(), key: this.selectedKey(), timestamps: this.timestamps(),
      }).subscribe(done);
    }
  }

  async copy(): Promise<void> {
    if (await copyText(this.transcript())) this.toast.success('Transcript copied.');
    else this.toast.error('Could not copy the transcript.');
  }
}
