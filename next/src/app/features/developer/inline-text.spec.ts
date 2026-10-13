import { TestBed } from '@angular/core/testing';
import { InlineText } from './inline-text';

describe('InlineText (MIG-336)', () => {
  it('draws a description\'s code spans as code and keeps the rest as text', () => {
    const fixture = TestBed.createComponent(InlineText);
    fixture.componentRef.setInput('text', 'Past a limit. `/problems/rate-limited`: wait; the _reference and _file_ids fields.');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('code')?.textContent).toBe('/problems/rate-limited');
    expect(el.textContent).toBe('Past a limit. /problems/rate-limited: wait; the _reference and _file_ids fields.');
    expect(el.innerHTML).not.toContain('`');
  });

  it('draws nothing for no text', () => {
    const fixture = TestBed.createComponent(InlineText);
    fixture.componentRef.setInput('text', null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toBe('');
  });
});
