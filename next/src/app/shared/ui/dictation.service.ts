import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

/**
 * Dictation into a text field, shared by the composers that offer it.
 *
 * The file chat grew this first; the job assistant needs exactly the same behaviour, and two
 * copies of a browser-API integration is two places for a permission or lifecycle bug to hide.
 *
 * Speech is appended to whatever is already typed rather than replacing it, so speaking after
 * typing extends the question instead of discarding it. Signals make the callbacks safe without
 * NgZone: setting one schedules its own change detection.
 */
@Injectable({ providedIn: 'root' })
export class DictationService {
  private readonly toast = inject(ToastService);
  private recognition: any = null;

  /** Which composer is currently listening, so two of them cannot both show a live mic. */
  private readonly owner = signal<string | null>(null);

  /** Not every browser exposes the speech API, and the button should not appear when it does not. */
  readonly supported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  listeningFor(id: string): boolean {
    return this.owner() === id;
  }

  /**
   * Starts or stops dictation for `id`. `onText` receives each final transcript; the caller
   * decides how to merge it, since only it knows what is already in its field.
   */
  toggle(id: string, onText: (said: string) => void): void {
    if (this.owner() === id) {
      this.recognition?.stop();
      return;
    }
    // Another composer holding the microphone is stopped first: the browser allows one.
    if (this.owner()) this.recognition?.stop();

    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      this.toast.error('This browser cannot record speech.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => this.owner.set(id);
    recognition.onerror = (event: any) => {
      this.owner.set(null);
      if (event?.error === 'not-allowed') this.toast.error('Microphone access was refused.');
      else if (event?.error !== 'aborted') this.toast.error('Could not hear anything.');
    };
    recognition.onend = () => { this.owner.set(null); this.recognition = null; };
    recognition.onresult = (event: any) => {
      const said = event.results?.[0]?.[0]?.transcript?.trim();
      if (said) onText(said);
    };
    this.recognition = recognition;
    recognition.start();
  }
}
