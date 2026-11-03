import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { KeepChoice, KeepDialog, KeepDialogData, monthFolder } from '../keep-dialog';
import { saveBlob } from '../tools-shared';
import { ImageApi } from './image.api';
import { Description, PhotoDetail, PhotoSummary } from './image.model';

/** The downloads a photo offers, in its menu's order. */
export const DOWNLOADS: { format: 'photo' | 'outlined' | 'pdf'; label: string; ext: string }[] = [
  { format: 'photo', label: 'Photo, as stored', ext: 'jpg' },
  { format: 'outlined', label: 'Photo with the measurement drawn', ext: 'jpg' },
  { format: 'pdf', label: 'Visit note', ext: 'pdf' },
];

/**
 * What a reader does with a photo, the same from the list's panel and the photo's page (design image-a): download, send to
 * Documents as a visit note, add to a report, start a pipeline, confirm / edit / discard the draft, describe again, delete. Each
 * asks first where it sends or removes something, and says how it went; the caller reads the photo again from what comes back.
 */
@Injectable({ providedIn: 'root' })
export class ImageActions {
  private readonly api = inject(ImageApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router, { optional: true });

  download(p: PhotoSummary, format: 'photo' | 'outlined' | 'pdf'): void {
    const stem = (p.fileName || `photo-${p.photoId}`).replace(/\.[^.]+$/, '');
    const name = format === 'pdf' ? `${stem}-visit-note.pdf` : format === 'outlined' ? `${stem}-measured.jpg` : p.fileName;
    this.api.download(p.photoId, format).subscribe({
      next: blob => saveBlob(blob, name),
      error: () => this.toast.error('The download could not be made.'),
    });
  }

  async sendToDocuments(p: PhotoSummary): Promise<PhotoDetail | null> {
    const confirmed = p.descriptionStatus === 'CONFIRMED';
    const ok = await confirmWith(this.dialog, { title: 'Send to Documents as a visit note', confirmLabel: 'Send',
      body: `${p.title} goes to Documents as a visit note (PDF): the photo${p.blurCount ? ', blurred as here' : ''}, its size measured in code`
        + (confirmed ? ' and the confirmed description.' : '. The description is not in it until a nurse confirms it.')
        + ' The photo is then kept here until the workspace\'s retention removes it.' });
    if (!ok) return null;
    try {
      const r = await firstValueFrom(this.api.sendToDocuments(p.photoId));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be sent to Documents.'); return null; }
      const intake = r.data.intake;
      if (intake.outcome === 'Refused') this.toast.error(intake.reason || 'Documents refused it.');
      else this.toast.success(intake.outcome === 'Duplicate' ? `Documents already has it (document ${intake.ocrDocumentId}).`
        : `Sent to Documents as document ${intake.ocrDocumentId}.`);
      return r.data.photo;
    } catch (err) {
      this.toast.error(messageOf(err) || 'It could not be sent to Documents.');
      return null;
    }
  }

  async addToReport(p: PhotoSummary): Promise<PhotoDetail | null> {
    const ok = await confirmWith(this.dialog, { title: 'Add to a report', confirmLabel: 'Add',
      body: `${p.title} becomes an image in Report Studio's Assets & branding, with its outline drawn, so a report can place it. `
        + 'The photo is then kept here until the workspace\'s retention removes it.' });
    if (!ok) return null;
    const done = await this.call(() => this.api.addToReport(p.photoId), 'It could not be added to Report Studio.');
    if (done) this.toast.success(`Added to Report Studio as ${done.reportAsset?.label ?? 'an image'}: place it from a template's images.`);
    return done;
  }

  /** A pipeline reads its files from a bucket: the photo is kept there, then the AI Assistant is asked to build one. */
  pipeline(p: PhotoSummary): void {
    this.dialog.open<KeepChoice | undefined>(KeepDialog, { data: {
      heading: 'Keep the photo in a bucket', confirmLabel: 'Keep and continue', folder: monthFolder('wound-photos'),
      subtitle: 'A pipeline reads its files from a bucket. The photo is saved there as stored here (location and camera details removed, '
        + 'blurred where you blurred it), then you describe the pipeline to the AI Assistant.',
    } satisfies KeepDialogData }).closed.subscribe(choice => {
      if (!choice) return;
      this.api.keep(p.photoId, choice.bucket, choice.folder).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'It could not be kept.'); return; }
          void this.router?.navigate(['/ai/assistant'], { queryParams: {
            prompt: `Build a pipeline that measures the wound photos in ${r.data.bucket}/${choice.folder || ''} with Measure image (red_region) and `,
          } });
        },
        error: err => this.toast.error(messageOf(err) || 'It could not be kept.'),
      });
    });
  }

  async confirm(p: PhotoSummary, fields?: Description): Promise<PhotoDetail | null> {
    const done = await this.call(() => this.api.confirm(p.photoId, fields), 'The description could not be confirmed.');
    if (done) this.toast.success('Description confirmed.');
    return done;
  }

  async discard(p: PhotoSummary): Promise<PhotoDetail | null> {
    const ok = await confirmWith(this.dialog, { title: 'Discard the draft', confirmLabel: 'Discard', danger: true,
      body: 'The draft description is removed. The size, measured in code, stays.' });
    if (!ok) return null;
    return this.call(() => this.api.discard(p.photoId), 'The draft could not be discarded.');
  }

  describeAgain(p: PhotoSummary): Promise<PhotoDetail | null> {
    return this.call(() => this.api.describeAgain(p.photoId), 'A new draft could not be asked for.');
  }

  async remove(p: PhotoSummary): Promise<boolean> {
    const ok = await confirmWith(this.dialog, { title: 'Delete photo', confirmLabel: 'Delete', danger: true,
      body: `${p.title} is removed now: the photo, its measurement and its description. A copy sent to Documents or a report stays there.` });
    if (!ok) return false;
    try {
      const r = await firstValueFrom(this.api.remove(p.photoId));
      if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'It could not be deleted.'); return false; }
      this.toast.success('Photo deleted.');
      return true;
    } catch (err) {
      this.toast.error(messageOf(err) || 'It could not be deleted.');
      return false;
    }
  }

  async call(run: () => Observable<ApiResponse<PhotoDetail>>, failed: string): Promise<PhotoDetail | null> {
    try {
      const r = await firstValueFrom(run());
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || failed); return null; }
      return r.data;
    } catch (err) {
      this.toast.error(messageOf(err) || failed);
      return null;
    }
  }
}

export function messageOf(err: unknown): string | undefined {
  return (err as { error?: { message?: string } })?.error?.message;
}
