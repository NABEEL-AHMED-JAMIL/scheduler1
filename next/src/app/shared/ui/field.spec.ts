import { describe, it, expect } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Field } from './field';

@Component({
  imports: [Field],
  template: `
    <app-field label="Bucket" for="bucket" [error]="error()" [hint]="hint()">
      <input id="bucket" class="input" [attr.aria-describedby]="describedBy()" />
    </app-field>
  `,
})
class Host {
  readonly error = signal('');
  readonly hint = signal('');
  readonly describedBy = signal<string | null>(null);
}

/**
 * A field whose error comes from somewhere other than a validator -- the server refused the
 * name, a test connection failed -- shows it in the same place and the same way, and the
 * control says where its explanation is.
 */
describe('Field error', () => {
  function render() {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, host: fixture.componentInstance, input: el.querySelector('input')! };
  }

  it('shows a given error under the control, as an alert', () => {
    const { fixture, el, host } = render();
    host.error.set('That bucket does not exist.');
    fixture.detectChanges();
    const note = el.querySelector('[role="alert"]')!;
    expect(note.textContent).toContain('That bucket does not exist.');
    expect(el.querySelector('.field')!.classList).toContain('field-invalid');
  });

  it('points the control at the error with aria-describedby, and lets go when it clears', async () => {
    const { fixture, el, host, input } = render();
    host.error.set('That bucket does not exist.');
    fixture.detectChanges();
    await fixture.whenStable();
    const note = el.querySelector('[role="alert"]')!;
    expect(note.id).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBe(note.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    host.error.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps a description the caller set', async () => {
    const { fixture, el, host, input } = render();
    host.describedBy.set('own-note');
    fixture.detectChanges();
    host.error.set('Nope.');
    fixture.detectChanges();
    await fixture.whenStable();
    const note = el.querySelector('[role="alert"]')!;
    expect(input.getAttribute('aria-describedby')!.split(' ').sort()).toEqual(['own-note', note.id].sort());
  });

  it('describes the control by its hint while there is no error', async () => {
    const { fixture, el, host, input } = render();
    host.hint.set('Lower case, no spaces.');
    fixture.detectChanges();
    await fixture.whenStable();
    const note = el.querySelector('.field-note')!;
    expect(input.getAttribute('aria-describedby')).toBe(note.id);
  });
});
