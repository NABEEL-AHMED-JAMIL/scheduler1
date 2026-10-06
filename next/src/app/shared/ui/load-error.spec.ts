import { describe, it, expect } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoadError } from './load-error';

@Component({
  imports: [LoadError],
  template: `<app-load-error [message]="'Task #9 does not exist or was deleted.'" [retryable]="retryable()">
    <a class="back" href="/operations/tasks">Back to tasks</a></app-load-error>`,
})
class Host { readonly retryable = signal(true); }

/**
 * A record that does not exist offered Try again, which could only fail the same way again. Such a
 * page hides it and puts its own way out (Back to tasks) in its place.
 */
describe('LoadError', () => {
  function render(retryable: boolean) {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.retryable.set(retryable);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers Try again by default', () => {
    const el = render(true);
    expect(el.textContent).toContain('Try again');
  });

  it('hides Try again when trying again cannot help, and shows the page\'s own way out', () => {
    const el = render(false);
    expect(el.textContent).not.toContain('Try again');
    expect(el.querySelector('a.back')?.textContent).toContain('Back to tasks');
  });
});
