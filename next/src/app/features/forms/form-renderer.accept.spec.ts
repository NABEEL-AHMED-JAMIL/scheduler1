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
