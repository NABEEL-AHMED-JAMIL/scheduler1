import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { NEVER, of } from 'rxjs';
import { Transcript } from './transcript';
import { StorageService } from '../../objects/storage.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReadAloudService } from '../../../shared/ui/read-aloud.service';
import { signal } from '@angular/core';

/** Audit 09-22, the Audio Transcript Extractor as drawn. */
function page(objects: { name: string; key: string; folder: boolean }[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: vi.fn(() => NEVER), post: vi.fn(() => NEVER) } },
    { provide: StorageService, useValue: {
      buckets: () => of({ status: 'SUCCESS', data: [{ label: 'Audio', bucket: 'audio', provider: 'MINIO' }] }),
      listObjects: () => of({ status: 'SUCCESS', data: { objects } }),
    } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    { provide: ReadAloudService, useValue: { supported: true, state: signal('paused'), stop: vi.fn(), progress: signal(null), rate: signal(1), setRate: vi.fn(), speak: vi.fn(), pause: vi.fn(), resume: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(Transcript);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, t: fixture.componentInstance, el };
}

describe('Transcript, rendered', () => {
  it('shows an extraction error with the alert icon and Try again', () => {
    const { t, fixture, el } = page();
    const extract = vi.spyOn(t, 'extract').mockImplementation(() => {});
    t.error.set('The speech service is down.');
    fixture.detectChanges();
    const card = [...el.querySelectorAll('[role="alert"]')].find(n => n.textContent!.includes('The speech service is down.'))!;
    expect(card.querySelector('app-icon[name="alert"]')).not.toBeNull();
    [...card.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!.click();
    expect(extract).toHaveBeenCalled();
  });

  it('drops the previous transcript when another bucket file is picked', () => {
    const { t, fixture } = page();
    t.selectedKey.set('calls/one.mp3');
    fixture.detectChanges();
    t.transcript.set('[00:00] hello');
    t.error.set('');
    t.selectedKey.set('calls/two.mp3');
    fixture.detectChanges();
    expect(t.transcript()).toBe('');
  });

  it('lets the read-aloud button\'s visible words be its name', () => {
    const { t, fixture, el } = page();
    t.transcript.set('[00:00] hello');
    fixture.detectChanges();
    // Paused, the button says "Resume"; an aria-label of "Read the transcript aloud" contradicted it.
    const read = [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Resume')!;
    expect(read).toBeTruthy();
    expect(read.getAttribute('aria-label')).toBeNull();
  });
});
