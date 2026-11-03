import { Component, Injectable, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { confirmWith } from '../../../shared/ui/confirm';
import { copyText } from '../../../shared/ui/clipboard.util';
import { KeepChoice, KeepDialog, KeepDialogData, monthFolder } from '../keep-dialog';
import { saveBlob } from '../tools-shared';
import { TranscriptApi } from './transcript.api';
import {
  Advice, ExportFormat, RecordingDetail, RecordingSummary, SPEAKER_CHOICES, SpeakerChoice, exportName, plainText,
} from './transcript.model';

/** Transcribe again: how many speakers this time, with what it costs said first. */
@Component({
  selector: 'app-transcribe-again',
  imports: [FormDialog],
  template: `
    <app-form-dialog heading="Transcribe again" [subtitle]="data.name" confirmLabel="Transcribe again" (cancelled)="ref.close()" (confirmed)="ref.close(choice())">
      <div class="field">
        <label class="label" for="again-spk">Speakers</label>
        <select id="again-spk" class="input" (change)="choice.set($any($event.target).value)" data-test="again-speakers">
          @for (c of choices; track c.id) { <option [value]="c.id" [selected]="choice() === c.id">{{ c.label }}</option> }
        </select>
      </div>
      <p class="text-sm text-[color:var(--text-secondary)] m-0">The recording is transcribed afresh: corrections and speaker names go with
        the old transcript, and the new one bills its audio minutes once.</p>
    </app-form-dialog>
  `,
})
export class TranscribeAgain {
  readonly ref = inject<DialogRef<SpeakerChoice | undefined>>(DialogRef);
  readonly data = inject<{ name: string; speakers: SpeakerChoice }>(DIALOG_DATA);
  readonly choices = SPEAKER_CHOICES;
  readonly choice = signal<SpeakerChoice>(this.data.speakers);
}

/**
 * What a reader does with a recording, the same from the list's panel and the transcript's page (tools Option A):
 * download, send to Documents, start a pipeline, keep in a bucket, copy, stop, try again or transcribe again, split, delete.
 * Each asks first where it changes something, and says how it went; the caller reads the recording again.
 */
@Injectable({ providedIn: 'root' })
export class TranscriptActions {
  private readonly api = inject(TranscriptApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });

  download(d: RecordingDetail, format: ExportFormat): void {
    this.api.exportFile(d.recordingId, format, !!d.maskExports).subscribe({
      next: blob => saveBlob(blob, exportName(d.name, format)),
      error: () => this.toast.error('The transcript could not be downloaded.'),
    });
  }

  /** The recording as Documents has it now, or null when it was not sent. */
  async sendToDocuments(d: RecordingDetail): Promise<RecordingDetail | null> {
    const ok = await confirmWith(this.dialog, { title: 'Send to Documents as a visit note', confirmLabel: 'Send',
      body: `${d.name} goes to Documents as a printable transcript${d.maskExports ? ' with personal details masked' : ''}: it is read, given a document type and put in the review queue.` });
    if (!ok) return null;
    try {
      const r = await firstValueFrom(this.api.sendToDocuments(d.recordingId));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be sent to Documents.'); return null; }
      const intake = r.data.intake;
      if (intake.outcome === 'Refused') this.toast.error(intake.reason || 'Documents refused it.');
      else this.toast.success(intake.outcome === 'Duplicate' ? `Documents already has it (document ${intake.ocrDocumentId}).`
        : `Sent to Documents as document ${intake.ocrDocumentId}; it appears under Documents in once it is read.`);
      return r.data.recording;
    } catch (err) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || 'It could not be sent to Documents.');
      return null;
    }
  }

  /** Keeps the transcript in a bucket as text, then (for a pipeline) opens the AI Assistant on it. */
  keep(d: RecordingDetail, forPipeline: boolean): void {
    this.dialog.open<KeepChoice | undefined>(KeepDialog, { data: forPipeline ? {
      heading: 'Keep the transcript in a bucket', confirmLabel: 'Keep and continue', folder: monthFolder('transcripts'),
      subtitle: 'A pipeline reads its files from a bucket. The transcript is saved there as text with speakers and times, then you describe the pipeline to the AI Assistant.',
    } : {
      heading: 'Keep the transcript in a bucket', confirmLabel: 'Keep it', folder: monthFolder('transcripts'),
      subtitle: 'The transcript is saved to this folder as text with speakers and times, and kept until you remove it there.',
    } satisfies KeepDialogData }).closed.subscribe(choice => {
      if (!choice) return;
      this.api.keep(d.recordingId, choice.bucket, choice.folder, 'txt').subscribe({
        next: r => {
          if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be kept.'); return; }
          if (forPipeline) void this.router?.navigate(['/ai/assistant'], { queryParams: { prompt: `Build a pipeline that reads the transcript ${r.data.bucket}/${r.data.key} and ` } });
          else this.toast.success(`Kept in ${r.data.bucket}/${r.data.key}`);
        },
        error: err => this.toast.error(err?.error?.message || 'It could not be kept.'),
      });
    });
  }

  async copy(d: RecordingDetail): Promise<void> {
    const ok = await copyText(plainText(d));
    if (ok) this.toast.success('The transcript is copied.'); else this.toast.error('The transcript could not be copied.');
  }

  async stop(r: RecordingSummary): Promise<boolean> {
    const ok = await confirmWith(this.dialog, { title: 'Stop transcribing', body: `${r.name} stops now. Nothing is billed for it.`,
      confirmLabel: 'Stop', danger: true });
    if (!ok) return false;
    return this.call(() => this.api.stop(r.recordingId), 'It could not be stopped.');
  }

  async remove(r: RecordingSummary): Promise<boolean> {
    const ok = await confirmWith(this.dialog, { title: 'Delete recording', confirmLabel: 'Delete', danger: true,
      body: `${r.name}, its transcript and its recording are removed. This cannot be undone.` });
    if (!ok) return false;
    const done = await this.call(() => this.api.remove(r.recordingId), 'It could not be deleted.');
    if (done) this.toast.success(`${r.name} deleted.`);
    return done;
  }

  /** Transcribe again a finished recording, asking how many speakers first. */
  async again(d: RecordingDetail): Promise<boolean> {
    const speakers = await firstValueFrom(this.dialog.open<SpeakerChoice | undefined>(TranscribeAgain, {
      data: { name: d.name, speakers: d.speakersAsked ?? 'auto' }, hasBackdrop: true }).closed);
    if (!speakers) return false;
    const done = await this.call(() => this.api.retry(d.recordingId, speakers), 'It could not be started again.');
    if (done) this.toast.success(`${d.name} is being transcribed again; you can leave this page.`);
    return done;
  }

  /** A failure's one action (Split at 30 min, Try again); Choose another and Open converter are the caller's. */
  async act(r: RecordingSummary, advice: Advice): Promise<RecordingSummary[] | boolean> {
    if (advice.action === 'retry') return this.call(() => this.api.retry(r.recordingId), 'It could not be started again.');
    if (advice.action !== 'split') return false;
    try {
      const x = await firstValueFrom(this.api.split(r.recordingId));
      if (x.status !== API_SUCCESS || !x.data) { this.toast.error(x.message || 'It could not be split.'); return false; }
      this.toast.success(`Split into ${x.data.parts.length} parts; each is transcribed by itself.`);
      return x.data.parts;
    } catch (err) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || 'It could not be split.');
      return false;
    }
  }

  private async call(run: () => ReturnType<TranscriptApi['stop']> | ReturnType<TranscriptApi['remove']>, failed: string): Promise<boolean> {
    try {
      const x = await firstValueFrom(run());
      if (x.status !== API_SUCCESS) { this.toast.error(x.message || failed); return false; }
      return true;
    } catch (err) {
      this.toast.error((err as { error?: { message?: string } })?.error?.message || failed);
      return false;
    }
  }
}
