import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RequestWorkspace } from './request-workspace';
import { ThemeService } from '../../core/theme.service';

/**
 * The success card said "Thank you -- your request has been recorded" over a server message that
 * says the same, and an over-long field went to the server and came back as a generic 500.
 */
function mount() {
  const post = vi.fn(() => of({ status: 'SUCCESS', message: 'Thank you. We have recorded your request.' }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RequestWorkspace], providers: [provideRouter([]),
    { provide: HttpClient, useValue: { post } },
    { provide: ThemeService, useValue: { theme: signal('light'), toggle: () => {} } }] });
  const fixture = TestBed.createComponent(RequestWorkspace);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, post };
}

describe('RequestWorkspace', () => {
  it('heads the acknowledgement plainly instead of repeating it', () => {
    const { fixture, component, el } = mount();
    component.form.setValue({ organisationName: 'Northwind', contactName: 'Ada', contactEmail: 'ada@example.com', purpose: '' });
    component.submit();
    fixture.detectChanges();
    expect(el.querySelector('h1')!.textContent!.trim()).toBe('Request received');
    expect(el.textContent).toContain('We have recorded your request.');
  });

  it('refuses a field over 255 characters before sending, and says so', () => {
    const { fixture, component, el, post } = mount();
    component.form.setValue({ organisationName: 'N'.repeat(256), contactName: 'Ada', contactEmail: 'ada@example.com', purpose: '' });
    component.submit();
    fixture.detectChanges();
    expect(post).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Keep this under 255 characters.');
    expect(el.querySelector('#organisationName')!.getAttribute('maxlength')).toBe('255');
    expect(el.querySelector('#contactName')!.getAttribute('maxlength')).toBe('255');
    expect(el.querySelector('#contactEmail')!.getAttribute('maxlength')).toBe('255');
  });
});
