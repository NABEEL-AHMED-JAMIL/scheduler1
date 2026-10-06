import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

/** The initials a person is shown by when there is no picture. */
describe('Avatar initials', () => {
  const initialsOf = (name: string) => {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.componentInstance.initials();
  };

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
  });
});
