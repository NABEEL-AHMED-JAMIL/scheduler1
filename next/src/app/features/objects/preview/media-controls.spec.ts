import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PdfViewer } from './pdf-viewer';
import { AudioPlayer } from './audio-player';

/** Audit 09-22: the PDF viewer and the audio player, named, and honest when something fails. */
function pdf(src: string | null = null) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PdfViewer);
  fixture.componentRef.setInput('src', src);
  fixture.detectChanges();
  return { fixture, viewer: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('PdfViewer', () => {
  it('names its page and zoom buttons', () => {
    const { viewer, fixture, el } = pdf();
    viewer.pageCount.set(3);
    fixture.detectChanges();
    for (const name of ['Previous page', 'Next page', 'Zoom out', 'Zoom in']) {
      expect(el.querySelector(`button[aria-label="${name}"]`), name).not.toBeNull();
    }
  });

  it('a page that fails to draw does not blank every other page', async () => {
    const { viewer, fixture, el } = pdf();
    const fake = { numPages: 3, getPage: vi.fn((n: number) => (n === 2 ? Promise.reject(new Error('bad page')) : Promise.resolve({ getViewport: () => ({ width: 10, height: 10 }), render: () => ({ promise: Promise.resolve() }) }))) };
    (viewer as any).doc = fake;
    viewer.pageCount.set(3);
    viewer.page.set(2);
    fixture.detectChanges();                         // the page effect draws
    await vi.waitFor(() => { fixture.detectChanges(); expect(el.textContent).toContain('Page 2 could not be drawn.'); });
    viewer.go(1);
    fixture.detectChanges();
    await vi.waitFor(() => { fixture.detectChanges(); expect(el.textContent).not.toContain('could not be drawn'); });
    expect(el.querySelector('canvas')!.classList).not.toContain('hidden');
  });

  it('offers Try again when the PDF cannot be opened', async () => {
    const { viewer, fixture, el } = pdf();
    viewer.error.set('This PDF could not be opened.');
    fixture.componentRef.setInput('src', 'blob:doc');
    const open = vi.spyOn(viewer as any, 'open').mockResolvedValue(undefined);
    fixture.detectChanges();
    open.mockClear();
    const retry = [...el.querySelectorAll('button')].find(b => b.textContent!.includes('Try again'))!;
    expect(retry).toBeTruthy();
    retry.click();
    expect(open).toHaveBeenCalledWith('blob:doc');
  });
});

describe('AudioPlayer', () => {
  function audio() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(AudioPlayer);
    fixture.componentRef.setInput('src', 'blob:song');
    fixture.detectChanges();
    return { fixture, player: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('names the speed button by what it does, not just "1x"', () => {
    const { el } = audio();
    expect(el.querySelector('button[aria-label="Playback speed 1x"]')).not.toBeNull();
  });

  it('says so when the file cannot be played', () => {
    const { el, fixture } = audio();
    el.querySelector('audio')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('could not be played');
  });

  it('catches a refused play() instead of leaving an unhandled rejection', async () => {
    const { el, player, fixture } = audio();
    const media = el.querySelector('audio')!;
    Object.defineProperty(media, 'paused', { value: true, configurable: true });
    media.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')));
    player.toggle();
    await Promise.resolve(); await Promise.resolve();
    fixture.detectChanges();
    expect(player.failed()).toBe(true);
  });
});
