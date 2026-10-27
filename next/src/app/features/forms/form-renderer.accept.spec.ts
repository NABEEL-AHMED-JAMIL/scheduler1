import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormRenderer } from './form-renderer';
import { FormField } from './forms.model';

// MIG-325: a photo field offers a phone's camera and photo library, and an iPhone's HEIC photo arrives as a JPEG.
describe('a file field\'s accepted types', () => {
  function renderer(): FormRenderer {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    return TestBed.createComponent(FormRenderer).componentInstance;
  }

  const field = (accept: string[]): FormField => ({ key: 'image', label: 'Photo', type: 'file', required: true, accept });

  it('names each image type by MIME as well as by extension', () => {
    expect(renderer().acceptOf(field(['jpg', 'jpeg', 'PNG']))).toBe('.jpg,.jpeg,.png,image/jpeg,image/png');
  });

  it('leaves other types as extensions only', () => {
    expect(renderer().acceptOf(field(['pdf', 'csv']))).toBe('.pdf,.csv');
  });
});

/**
 * ZT-F1 (2026-10-21): a form's table with a date column showed the computer's locale ("10/19/2026") beside a date field
 * written as the rest of the console writes it ("20 Oct 2026") -- UI review U3's rule, missed in table cells.
 */
describe('a date column of a form\'s table', () => {
  it('ZT-F1: shows the day as the console writes it, picked through the date field', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(FormRenderer);
    fixture.componentRef.setInput('fields', [{ key: 'doses', label: 'Doses', type: 'table', required: false, maxRows: 3,
      columns: [{ key: 'drug', label: 'Drug', type: 'text', required: true }, { key: 'given', label: 'Given on', type: 'date', required: false }] }]);
    fixture.componentRef.setInput('answers', { doses: [{ drug: 'Amoxicillin', given: '2026-10-19' }] });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('td input[type="date"]:not(.date-field-native)')).toBeNull();
    const day = host.querySelector('td app-date-field');
    expect(day?.textContent).toContain('19 Oct 2026');
    expect(day?.querySelector('button')?.getAttribute('aria-label')).toBe('Given on, row 1: 19 Oct 2026');
  });
});
