import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../core/api/api.config';
import { AVATAR_TONES, Avatar, AvatarCache, avatarTone, initialsOf } from './avatar';

/** The initials a person is shown by when there is no picture. */
describe('Avatar initials', () => {
  it('takes the first and last word\'s first letters', () => {
    expect(initialsOf('Claude Demo Admin')).toBe('CA');
    expect(initialsOf('alex')).toBe('AL');
  });

  it('skips a bracketed note and leading punctuation', () => {
    expect(initialsOf('Acceptance Test User (synthetic)')).toBe('AU');
    expect(initialsOf('"Sam" O\'Neil')).toBe('SO');
  });

  it('says ? when there is no name to read', () => {
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('(system)')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });
});

/** The colour initials sit on: one of the eight chart slots, the same for a person every time. */
describe('avatarTone', () => {
  it('is fixed per person', () => {
    expect(avatarTone(4640)).toBe(avatarTone(4640));
    expect(avatarTone(4640, 'Someone else entirely')).toBe(avatarTone(4640));
  });

  it('is always one of the eight slots', () => {
    for (let id = 1; id < 5000; id += 7) {
      const tone = avatarTone(id);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(AVATAR_TONES);
      expect(Number.isInteger(tone)).toBe(true);
    }
  });

  it('spreads people added one after another across the ramp', () => {
    const tones = new Set(Array.from({ length: 8 }, (_, k) => avatarTone(4640 + k)));
    expect(tones.size).toBeGreaterThanOrEqual(5);
    const all = Array.from({ length: 800 }, (_, k) => avatarTone(1000 + k));
    for (let t = 0; t < AVATAR_TONES; t++) expect(all.filter(x => x === t).length).toBeGreaterThan(60);
  });

  it('falls back to the name, the same way every time, when there is no id', () => {
    expect(avatarTone(null, 'Riverside Health admin')).toBe(avatarTone(undefined, '  riverside health ADMIN '));
    expect(avatarTone(null, '')).toBeGreaterThanOrEqual(0);
  });
});

@Component({
  imports: [Avatar],
  template: `
    @for (p of people(); track $index) {
      <app-avatar [appUserId]="p.id" [version]="p.version" [name]="p.name" [size]="p.size ?? 2.25" [decorative]="p.decorative ?? false" />
    }
  `,
})
class Host {
  readonly people = signal<{ id: number | null; version?: string | null; name: string; size?: number; decorative?: boolean }[]>([]);
}

describe('app-avatar', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const render = (people: { id: number | null; version?: string | null; name: string; size?: number; decorative?: boolean }[]) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.people.set(people);
    fixture.detectChanges();
    return fixture;
  };

  it('asks nothing for someone the data says has no picture, and draws their initials on their colour', () => {
    const el: HTMLElement = render([{ id: 4641, version: null, name: 'Riverside Health reviewer' }]).nativeElement;
    http.expectNone(() => true);
    const initials = el.querySelector('.avatar-initials') as HTMLElement;
    expect(initials.getAttribute('data-initials')).toBe('RR');
    expect(initials.textContent?.trim()).toBe('');
    expect(initials.classList).toContain(`avatar-tone-${avatarTone(4641)}`);
    expect(initials.style.width).toBe('2.25rem');
    expect(initials.getAttribute('role')).toBe('img');
    expect(initials.getAttribute('aria-label')).toBe('Riverside Health reviewer');
  });

  it('fetches a known version once, at the size it is drawn, however many times it is shown', () => {
    const fixture = render([
      { id: 4640, version: 'abc123', name: 'A', size: 1.5 },
      { id: 4640, version: 'abc123', name: 'A', size: 1.5 },
      { id: 4640, version: 'abc123', name: 'A', size: 7 },
    ]);
    const small = http.expectOne(`${API_BASE}/appUser.json/avatar?appUserId=4640&size=64&v=abc123`);
    const large = http.expectOne(`${API_BASE}/appUser.json/avatar?appUserId=4640&size=256&v=abc123`);
    small.flush(new Blob(['x'], { type: 'image/jpeg' }));
    large.flush(new Blob(['y'], { type: 'image/jpeg' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('img.avatar-img').length).toBe(3);
  });

  it('asks without a version when the data does not say, and keeps the answer -- "none" included', () => {
    const first = render([{ id: 4642, name: 'Viewer' }]);
    http.expectOne(`${API_BASE}/appUser.json/avatar?appUserId=4642&size=256`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    first.detectChanges();
    expect(first.nativeElement.querySelector('.avatar-initials')).not.toBeNull();

    render([{ id: 4642, name: 'Viewer' }]);
    http.expectNone(`${API_BASE}/appUser.json/avatar?appUserId=4642&size=256`);
  });

  it('starts again for a person whose picture changed', () => {
    render([{ id: 4643, version: 'v1', name: 'M' }]);
    http.expectOne(`${API_BASE}/appUser.json/avatar?appUserId=4643&size=256&v=v1`).flush(new Blob(['x']));
    TestBed.inject(AvatarCache).forget(4643);
    render([{ id: 4643, version: 'v1', name: 'M' }]);
    http.expectOne(`${API_BASE}/appUser.json/avatar?appUserId=4643&size=256&v=v1`).flush(new Blob(['x']));
  });

  it('is not announced twice where the name is printed beside it', () => {
    const el: HTMLElement = render([{ id: 4644, version: null, name: 'Open Data Lab admin', decorative: true }]).nativeElement;
    const initials = el.querySelector('.avatar-initials') as HTMLElement;
    expect(initials.getAttribute('aria-hidden')).toBe('true');
    expect(initials.getAttribute('role')).toBeNull();
  });

  it('draws nothing to fetch for no id at all', () => {
    render([{ id: null, name: 'System' }]);
    http.expectNone(() => true);
  });
});
