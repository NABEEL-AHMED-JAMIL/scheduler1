import { describe, it, expect, afterEach } from 'vitest';
import { ApplicationRef, Component, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { focusFirstInvalid } from './focus-first-invalid';
import { FormDialog } from './form-dialog';
import { Field } from './field';

/**
 * "Check the highlighted fields." left focus on Save, so a keyboard or screen-reader user had to
 * go looking for the highlight, often above the fold on a long form (UI audit, Low).
 */
describe('focusFirstInvalid', () => {
  afterEach(() => document.body.replaceChildren());

  it('moves focus to the first field marked invalid, once the page has rendered', () => {
    const host = document.createElement('form');
    host.innerHTML = `<input id="a"><input id="b" aria-invalid="true"><input id="c" aria-invalid="true">`;
    document.body.appendChild(host);
    const b = host.querySelector<HTMLElement>('#b')!;
    b.scrollIntoView = () => {};
    TestBed.resetTestingModule();
    focusFirstInvalid(host, TestBed.inject(Injector));
    TestBed.inject(ApplicationRef).tick();
    expect(document.activeElement).toBe(b);
  });

  it('leaves focus alone when nothing is invalid', () => {
    const host = document.createElement('form');
    host.innerHTML = `<input id="a"><button id="save">Save</button>`;
    document.body.appendChild(host);
    const save = host.querySelector<HTMLElement>('#save')!;
    save.focus();
    TestBed.resetTestingModule();
    focusFirstInvalid(host, TestBed.inject(Injector));
    TestBed.inject(ApplicationRef).tick();
    expect(document.activeElement).toBe(save);
  });
});

@Component({
  imports: [FormDialog, Field, ReactiveFormsModule],
  template: `
    <app-form-dialog heading="New thing" (confirmed)="save()">
      <app-field label="Name" for="name" [control]="name" [submitted]="submitted()">
        <input id="name" class="input" [formControl]="name" />
      </app-field>
    </app-form-dialog>`,
})
class Dialog {
  readonly name = new FormControl('', Validators.required);
  readonly submitted = signal(false);
  save() { this.submitted.set(true); this.name.markAsTouched(); }
}

/** Eleven dialogs raise the same toast; the shared shell does it once for all of them. */
describe('FormDialog confirm with fields to fix', () => {
  afterEach(() => document.body.replaceChildren());

  it('takes focus to the first field to fix', async () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Dialog);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLElement>('#name')!;
    input.scrollIntoView = () => {};
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Save')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(input);
  });
});
