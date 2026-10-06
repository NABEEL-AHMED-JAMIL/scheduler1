import { describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RowSnap } from './row-snap';

/** UI review U7: a scrolling table box ends on a row boundary instead of cutting the last row in half. */
@Component({
  imports: [RowSnap],
  styles: ['.box { max-height: 300px; }'],
  template: `<div class="box" [appRowSnap]="on()"><table><tbody>
    @for (r of rows; track r) { <tr><td>{{ r }}</td></tr> }</tbody></table></div>`,
})
class Host {
  readonly on = signal(true);
  readonly rows = Array.from({ length: 10 }, (_, i) => i);
  readonly snap = viewChild.required(RowSnap);
}

function mount(on = true) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.on.set(on);
  fixture.detectChanges();
  const box = fixture.nativeElement.querySelector('.box') as HTMLElement;
  // jsdom lays nothing out: 10 rows of 70px under a 300px cap.
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 700 });
  vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 300 } as DOMRect);
  box.querySelectorAll('tr').forEach((tr, i) =>
    vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({ top: i * 70, bottom: (i + 1) * 70 } as DOMRect));
  return { fixture, box, snap: fixture.componentInstance.snap() };
}

describe('RowSnap', () => {
  it('shortens an overflowing box to the bottom of the last whole row', () => {
    const { box, snap } = mount();
    snap.snap();
    expect(box.style.maxHeight).toBe('280px');
  });

  it('leaves a box that is switched off, or whose rows fit, to its CSS cap', () => {
    const off = mount(false);
    off.snap.snap();
    expect(off.box.style.maxHeight).toBe('');
    TestBed.resetTestingModule();
    const fits = mount();
    Object.defineProperty(fits.box, 'scrollHeight', { configurable: true, get: () => 200 });
    fits.snap.snap();
    expect(fits.box.style.maxHeight).toBe('');
  });
});
