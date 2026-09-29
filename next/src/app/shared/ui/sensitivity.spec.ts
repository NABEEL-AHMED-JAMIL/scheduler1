import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SENSITIVITY_LEVELS, SensitivityTag, levelOf, sensitivityText, typedWord } from './sensitivity';

/**
 * MIG-243/254: the three levels a data policy knows. A collection or contract keeps the word it was given
 * (sensitivityLabel) beside the level it names (sensitivity); the console shows both when they differ.
 */
describe('data sensitivity levels', () => {
  it('knows public, internal and sensitive, in that order', () => {
    expect([...SENSITIVITY_LEVELS]).toEqual(['public', 'internal', 'sensitive']);
  });

  it('reads a level exactly, whatever its case, and nothing else', () => {
    expect(levelOf('Sensitive')).toBe('sensitive');
    expect(levelOf(' public ')).toBe('public');
    expect(levelOf('PHI')).toBeNull();
    expect(levelOf('')).toBeNull();
    expect(levelOf(null)).toBeNull();
  });

  it('names a level in sentence case, and says so when there is none', () => {
    expect(sensitivityText('internal')).toBe('Internal');
    expect(sensitivityText('sensitive')).toBe('Sensitive');
    expect(sensitivityText(null)).toBe('Not set');
    expect(sensitivityText('odd')).toBe('odd');
  });

  it('shows the typed word only when it says something the level does not', () => {
    expect(typedWord('sensitive', 'PHI')).toBe('PHI');
    expect(typedWord('internal', 'INTERNAL')).toBeNull();
    expect(typedWord('internal', null)).toBeNull();
    expect(typedWord('internal', '  ')).toBeNull();
  });
});

describe('app-sensitivity', () => {
  function render(level: string | null, label: string | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SensitivityTag], providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(SensitivityTag);
    f.componentRef.setInput('level', level);
    f.componentRef.setInput('label', label);
    f.detectChanges();
    return (f.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  }

  it('shows the level and the word it was given', () => {
    expect(render('sensitive', 'PHI')).toBe('Sensitive PHI');
  });

  it('shows the level alone when the word is the level', () => {
    expect(render('internal', 'INTERNAL')).toBe('Internal');
  });

  it('says a level nobody set is the default', () => {
    expect(render('internal', null)).toBe('Internal not set');
  });

  it('shows nothing but a dash without a level', () => {
    expect(render(null, null)).toBe('—');
  });
});
