import { InjectionToken } from '@angular/core';

/**
 * What the crop dialog is given: the picture, and how to hand back the square (or nothing, for Cancel). A token of its
 * own rather than the CDK's DIALOG_DATA and DialogRef, so the dialog's lazy chunk needs only @angular/core: a lazy
 * entry that reached the CDK (and through it the platform's DOM code) without the router split a shared chunk out of
 * the first load, which then cost more to send.
 */
export interface CropSession {
  /** Already checked to be a PNG, JPEG or WebP under 5 MB. */
  file: Blob;
  close(square?: Blob): void;
}

export const CROP_SESSION = new InjectionToken<CropSession>('avatar crop session');
