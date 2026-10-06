import { describe, it, expect } from 'vitest';
import { labelOf, valueKind } from './value-kind';

/**
 * How a request's value reads in the Task inbox, by its shape and never by its field's name (owner, 2026-10-06: the
 * detail showed DOSES as [{"mg":500,"drug":"Amoxicillin"}] and PHOTO as a bare "heel.png").
 */
describe('A request value, by its shape', () => {
  it('reads a list of records as a small table, whether it came as a list or as its JSON text', () => {
    const table = { kind: 'table', columns: ['Mg', 'Drug'], rows: [['500', 'Amoxicillin'], ['250', 'Ibuprofen']] };
    expect(valueKind([{ mg: 500, drug: 'Amoxicillin' }, { mg: 250, drug: 'Ibuprofen' }])).toEqual(table);
    expect(valueKind('[{"mg":500,"drug":"Amoxicillin"},{"mg":250,"drug":"Ibuprofen"}]')).toEqual(table);
    // A column a record lacks is a dash, not a gap; a yes/no inside reads Yes or No.
    expect(valueKind([{ a: 1 }, { a: 2, b: true }])).toEqual({ kind: 'table', columns: ['A', 'B'], rows: [['1', '—'], ['2', 'Yes']] });
  });

  it('reads a short list as chips, and a long one as wrapping text', () => {
    expect(valueKind(['Amoxicillin', 'Ibuprofen'])).toEqual({ kind: 'chips', items: ['Amoxicillin', 'Ibuprofen'] });
    expect(valueKind([{ tag: 'urgent' }, { tag: 'follow-up' }])).toEqual({ kind: 'chips', items: ['urgent', 'follow-up'] });
    const many = Array.from({ length: 12 }, (_, i) => `item ${i}`);
    expect(valueKind(many)).toEqual({ kind: 'long', text: many.join(', ') });
  });

  it('reads a record as a two-column table of its fields', () => {
    expect(valueKind({ city: 'Austin', zipCode: '78701' })).toEqual({ kind: 'table', columns: ['Field', 'Value'],
      rows: [['City', 'Austin'], ['Zip code', '78701']] });
  });

  it('reads true and false as Yes and No', () => {
    expect(valueKind(true)).toEqual({ kind: 'bool', text: 'Yes' });
    expect(valueKind('false')).toEqual({ kind: 'bool', text: 'No' });
  });

  it('reads a file name or key as a file chip, linked only where the value itself is a web address', () => {
    expect(valueKind('heel.png')).toEqual({ kind: 'file', name: 'heel.png', image: true, href: null });
    expect(valueKind('intake/2026/10/scan%20one.PDF')).toEqual({ kind: 'file', name: 'scan one.PDF', image: false, href: null });
    expect(valueKind('MIG286-customers.csv')).toMatchObject({ kind: 'file', image: false, href: null });
    expect(valueKind('https://files.example.test/a/b/photo.jpg?sig=1')).toEqual({ kind: 'file', name: 'photo.jpg', image: true,
      href: 'https://files.example.test/a/b/photo.jpg?sig=1' });
    // A sentence that ends in a file's extension is a sentence.
    expect(valueKind('please reconcile the numbers in the attached customers.csv')).toMatchObject({ kind: 'text' });
  });

  it('sets ids and technical keys quietly, and leaves numbers and words as they are', () => {
    expect(valueKind('SYN-001')).toEqual({ kind: 'id', text: 'SYN-001' });
    expect(valueKind('9b2f6c1e-1d3a-4c55-8f0e-0a1b2c3d4e5f')).toMatchObject({ kind: 'id' });
    expect(valueKind('4e847b8e719b2acad7fdd61c')).toMatchObject({ kind: 'id' });
    expect(valueKind('visit_check.step2')).toMatchObject({ kind: 'id' });
    expect(valueKind(1200)).toEqual({ kind: 'text', text: '1200' });
    expect(valueKind('Restricted')).toEqual({ kind: 'text', text: 'Restricted' });
    expect(valueKind('ACME')).toEqual({ kind: 'text', text: 'ACME' });
  });

  it('lets a long text wrap, and reads a timestamp as a 24-hour time', () => {
    const reason = 'MIG-287 live check: reconcile customer emails for the churn review before the quarterly report goes out';
    expect(valueKind(reason)).toEqual({ kind: 'long', text: reason });
    expect(valueKind('line one\nline two')).toEqual({ kind: 'long', text: 'line one\nline two' });
    expect(valueKind('2026-10-07T21:34:00')).toMatchObject({ kind: 'text', text: expect.stringMatching(/^\d{1,2} Oct, \d{2}:\d{2}$/) });
  });

  it('labels a key in sentence case', () => {
    expect(labelOf('submittedBy')).toBe('Submitted by');
    expect(labelOf('submission_id')).toBe('Submission ID');
  });
});
