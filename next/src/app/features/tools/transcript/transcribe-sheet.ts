import { AfterViewInit, Component, computed, inject, signal, viewChild } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { NewTranscript } from './new-transcript';
import { TranscriptApi } from './transcript.api';
import { Advice, RecordingDetail, TranscriptLimits } from './transcript.model';

export interface TranscribeSheetData {
  limits: TranscriptLimits;
  canSend: boolean;
  bucketAllowed: boolean;
  /** Recordings dropped on the list: they join the new transcript at once. */
  files?: File[];
}

/**
 * Transcribe recordings (tools Option A): the new transcript in a panel over the list -- several recordings, their
 * lengths read before upload, the name, language, speakers (found, one, or exactly 2 to 6), keeping the recording,
 * masking, Send to Documents when done, and the time and minutes billed before it starts. A file that is not a recording
 * is said here, with the converter. Closes with what was started.
 */
@Component({
  selector: 'app-transcribe-sheet',
  imports: [SidePanel, Icon, NewTranscript],
  template: `
    <app-side-panel heading="Transcribe recordings" [subtitle]="subtitle()">
      @if (rejects().length) {
        <div class="flex flex-col gap-2 mb-4" data-test="could-not">
          @for (a of rejects(); track $index) {
            <div class="flex items-start gap-2 text-sm" role="alert">
              <app-icon [name]="a.icon" class="icon-crit shrink-0 mt-0.5" />
              <div class="flex-1"><b class="font-medium">{{ a.title }}</b> <span class="text-[color:var(--text-secondary)]">{{ a.text }}</span></div>
              <button type="button" class="btn btn-default btn-xs" (click)="toConverter()">{{ a.actionLabel }}</button>
            </div>
          }
        </div>
      }
      <app-new-transcript [limits]="limits()" [canSend]="data.canSend" [bucketAllowed]="data.bucketAllowed" [framed]="false"
                          (created)="ref.close($event)" (rejected)="onRejected($event)" />
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">Recordings never leave this platform.</span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class TranscribeSheet implements AfterViewInit {
  readonly ref = inject<DialogRef<RecordingDetail[] | undefined>>(DialogRef);
  readonly data = inject<TranscribeSheetData>(DIALOG_DATA);
  private readonly router = inject(Router, { optional: true });
  readonly form = viewChild(NewTranscript);
  readonly rejects = signal<Advice[]>([]);
  /** The list's limits to start with, read again here: a sheet opened from a link (?new=1) may come before the list's. */
  readonly limits = signal<TranscriptLimits>(this.data.limits);
  readonly subtitle = computed(() => this.limits().running != null
    ? `Right now: ${this.limits().running} transcribing, ${this.limits().waiting ?? 0} waiting · billed by the minute of audio`
    : 'Billed by the minute of audio');

  constructor() {
    inject(TranscriptApi).limits?.().subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data && Array.isArray(r.data.formats)) this.limits.set({ ...this.data.limits, ...r.data }); },
      error: () => undefined,
    });
  }

  ngAfterViewInit(): void {
    const files = this.data.files ?? [];
    // After this first check: the form's own lists change as the files are read.
    if (files.length) setTimeout(() => void this.form()?.add(files));
  }

  onRejected(advice: Advice): void {
    this.rejects.update(list => [advice, ...list].slice(0, 5));
  }

  toConverter(): void {
    this.ref.close();
    void this.router?.navigate(['/tools/converter']);
  }
}
