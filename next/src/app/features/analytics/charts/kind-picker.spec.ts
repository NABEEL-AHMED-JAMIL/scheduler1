import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KindPicker } from './kind-picker';
import { KINDS } from '../widget-kinds';

@Component({
  imports: [KindPicker],
  template: `
    <app-kind-picker [issues]="issues()" [selected]="selected()" [preview]="withPreview() ? preview : null"
                     (chosen)="chosen.push($event)" (hover)="hovered.push($event)" />
    <ng-template #preview let-kind><p class="preview-of">Drawn as {{ kind }}</p></ng-template>
  `,
})
class Host {
  readonly issues = signal<Record<string, string> | null>(null);
  readonly selected = signal<string | null>('table');
  readonly withPreview = signal(true);
  readonly chosen: string[] = [];
  readonly hovered: (string | null)[] = [];
}

function render(issues: Record<string, string> | null = null) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.issues.set(issues);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const option = (id: string) => el.querySelector<HTMLButtonElement>(`button.kind-option[data-kind="${id}"]`)!;
  return { fixture, host: fixture.componentInstance, el, option };
}

describe('the chart picker', () => {
  it('lists every kind once, under its category heading, with a glyph', () => {
    const { el } = render();
    const ids = [...el.querySelectorAll<HTMLButtonElement>('button.kind-option')].map(b => b.dataset['kind']);
    expect(ids).toEqual(KINDS.map(kind => kind.id));
    const headings = [...el.querySelectorAll('h4')].map(h => h.textContent!.trim());
    expect(headings).toEqual([...new Set(KINDS.map(kind => kind.category))]);
    expect(el.querySelectorAll('button.kind-option svg path').length).toBe(KINDS.length);
  });

  it('searches labels, categories and what a kind needs', () => {
    const { fixture, el } = render();
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'sankey';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...el.querySelectorAll<HTMLButtonElement>('button.kind-option')].map(b => b.dataset['kind'])).toEqual(['sankey']);
    search.value = 'hierarchy';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect([...el.querySelectorAll<HTMLButtonElement>('button.kind-option')].map(b => b.dataset['kind'])).toEqual(['treemap', 'sunburst', 'tree']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('No chart type matches "zzz"');
  });

  it('marks a kind that does not fit, says why on it, and will not choose it', () => {
    const { el, host, option } = render({ sankey: 'A flow needs two columns of names.' });
    const sankey = option('sankey');
    expect(sankey.getAttribute('aria-disabled')).toBe('true');
    expect(sankey.title).toBe('A flow needs two columns of names.');
    expect(sankey.textContent).toContain('A flow needs two columns of names.');
    sankey.click();
    option('treemap').click();
    expect(host.chosen).toEqual(['treemap']);
    expect(el.textContent).toMatch(/Only what fits \(\d+ of \d+\)/);
  });

  it('can hide what does not fit', () => {
    const { fixture, el } = render({ sankey: 'no', chord: 'no' });
    el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    fixture.detectChanges();
    const ids = [...el.querySelectorAll<HTMLButtonElement>('button.kind-option')].map(b => b.dataset['kind']);
    expect(ids).not.toContain('sankey');
    expect(ids.length).toBe(KINDS.length - 2);
  });

  it('previews the kind under the pointer; over one that does not fit, keeps the chart and says why in a line', () => {
    // Owner, 2026-10-06: sweeping the pointer across the grid flashed "Doesn't fit" over the
    // preview at every refused kind on the way, which read as the chart failing.
    const { fixture, el, host, option } = render({ chord: 'A chord needs exactly two columns of names.' });
    expect(el.querySelector('.preview-of')!.textContent).toBe('Drawn as table');
    option('treemap').dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(el.querySelector('.preview-of')!.textContent).toBe('Drawn as treemap');
    expect(host.hovered).toEqual(['treemap']);
    option('treemap').dispatchEvent(new Event('mouseleave'));
    option('chord').dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(el.querySelector('.preview-of')!.textContent).toBe('Drawn as table');
    expect(el.querySelector('.kind-preview-why')!.textContent).toContain('Not for this result: a chord needs exactly two columns of names.');
    expect(el.querySelector('.kind-preview-why')!.textContent).toContain('Showing table.');
    expect(el.querySelector('.kind-preview')!.textContent).not.toContain("Doesn't fit");
    option('chord').dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(el.querySelector('.preview-of')!.textContent).toBe('Drawn as table');
    expect(el.querySelector('.kind-preview-why')).toBeNull();
  });

  it('never hands the preview a kind that does not fit, even the chosen one', () => {
    const { fixture, el, host } = render({ sankey: 'no' });
    host.selected.set('sankey');
    fixture.detectChanges();
    expect(el.querySelector('.preview-of')!.textContent).toBe('Drawn as table');
  });

  it('marks the chosen kind as pressed', () => {
    const { option } = render();
    expect(option('table').getAttribute('aria-pressed')).toBe('true');
    expect(option('bar').getAttribute('aria-pressed')).toBe('false');
  });
});
