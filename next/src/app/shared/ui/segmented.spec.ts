import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Segmented, SegmentOption } from './segmented';

/** An option that exists but cannot be chosen here is offered greyed, with its title saying why. */
describe('Segmented', () => {
  function render(options: SegmentOption<string>[]) {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [Segmented] }).createComponent(Segmented<string>);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', 'a');
    fixture.detectChanges();
    return { fixture, buttons: [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')] };
  }

  it('disables an option marked disabled and shows its title', () => {
    const { buttons } = render([
      { id: 'a', label: 'Upload' },
      { id: 'b', label: 'Bucket', disabled: true, title: 'No bucket is connected' },
    ]);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[0].hasAttribute('title')).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].getAttribute('title')).toBe('No bucket is connected');
  });

  it('gives an enabled option its title too', () => {
    const { buttons } = render([{ id: 'a', label: 'Upload', title: 'From this computer' }]);
    expect(buttons[0].getAttribute('title')).toBe('From this computer');
  });
});
