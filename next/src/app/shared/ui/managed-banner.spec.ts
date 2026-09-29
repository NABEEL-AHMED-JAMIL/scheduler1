import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedBanner } from './managed-banner';

function render(locked: boolean, what?: string): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
    { provide: AuthService, useValue: { builderLocked: signal(locked) } }] });
  const fixture = TestBed.createComponent(ManagedBanner);
  if (what) fixture.componentRef.setInput('what', what);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MIG-254: the "Managed by our team" banner', () => {
  it('says nothing in a workspace its own people build', () => {
    expect(render(false).textContent?.trim()).toBe('');
  });

  it('names what is read-only, and who to ask', () => {
    const text = render(true, 'pipelines').textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('Managed by our team');
    expect(text).toContain("Our team builds and changes this workspace's pipelines, so they are read-only here.");
    expect(text).toContain('Contact your account team to request a change.');
  });

  it('reads as one thing by default', () => {
    expect(render(true).textContent?.replace(/\s+/g, ' ')).toContain("this workspace's setup, so it is read-only here.");
  });
});
