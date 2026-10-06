import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResponseViewer } from './response-viewer';
import { RunResult } from './api-collections.model';

/**
 * MIG-247: what a test answered, as the service masked it -- the outcome, the status and timing, and the body,
 * headers, extracted values and assertions a person checks the API against.
 */
function render(result: RunResult) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(ResponseViewer);
  fixture.componentRef.setInput('result', result);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const OK: RunResult = {
  outcome: 'OK', statusCode: 200, durationMs: 284, pages: 1, attempts: 1, truncated: false, responseBytes: 2048,
  headers: { 'content-type': 'application/json', authorization: '••••' },
  body: { data: [{ id: 'SYN-1' }], next_cursor: 'eyJwIjoyfQ' },
  extracted: { first: 'SYN-1' }, assertions: [{ rule: 'status == 200', passed: true, actual: '200' }, { rule: '$.data notEmpty', passed: false, actual: '[]' }],
};

describe('ResponseViewer', () => {
  it('leads with the outcome, the status and how long it took', () => {
    const { el } = render(OK);
    const head = el.querySelector('[data-test="run-summary"]')!.textContent!.replace(/\s+/g, ' ');
    expect(head).toContain('200');
    expect(head).toContain('284 ms');
    expect(head).toContain('2.0 KB');
    expect(head).toContain('1 of 2 assertions passed');
  });

  it('shows the body as formatted JSON', () => {
    const { el } = render(OK);
    expect(el.querySelector('pre')!.textContent).toContain('"next_cursor": "eyJwIjoyfQ"');
  });

  it('lists the headers, extracted values and assertions on their own tabs', () => {
    const { fixture, el } = render(OK);
    const tab = (name: string) => Array.from(el.querySelectorAll('[role="tab"]')).find(t => t.textContent!.includes(name)) as HTMLElement;
    tab('Headers').click(); fixture.detectChanges();
    expect(el.textContent).toContain('content-type');
    tab('Extracted').click(); fixture.detectChanges();
    expect(el.textContent).toContain('SYN-1');
    tab('Assertions').click(); fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.textContent).toContain('$.data notEmpty');
  });

  it('says why a blocked call was not sent', () => {
    const { el } = render({ outcome: 'BLOCKED', message: 'The address 169.254.169.254 is not allowed.', durationMs: 0, pages: 0, attempts: 0,
      truncated: false, responseBytes: 0 });
    expect(el.textContent).toContain('Blocked');
    expect(el.textContent).toContain('The address 169.254.169.254 is not allowed.');
    expect(el.querySelector('pre')).toBeNull();
  });

  it('says when paging stopped at its cap', () => {
    const { el } = render({ ...OK, pages: 10, truncated: true, items: new Array(500).fill({}) });
    expect(el.textContent).toContain('500 items over 10 pages');
    expect(el.textContent).toContain('stopped at the page cap');
  });
});
