import { describe, it, expect, beforeEach } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GuideBlock, Span, linkTarget, parseGuide, parseSpans, slugify, withoutTitle } from './guide-markdown';
import { GuideBody } from './guide-body';
import { DOCS, DevLangService } from './developer-docs';
import { ToastService } from '../../shared/ui/toast.service';
import { useMemoryStorage } from '../../shared/testing/memory-storage';

/** A guide shaped like the ones etl-platform docs/api/guides holds: markers, a code group, a table, links. */
const FIXTURE = [
  '# Quickstart',
  '',
  'Get a token, then start a run. See [webhooks](webhooks.md#verify) and the [reference](/integration/developer/reference#op-startRun).',
  '',
  '## Get a token',
  '',
  '<!-- sample id="token" sets="TOKEN=access_token" -->',
  '```bash',
  'curl -X POST "$BASE/oauth/token"',
  '```',
  '<!-- sample id="token-py" -->',
  '',
  '```python',
  'import requests',
  '```',
  '```javascript',
  'const res = await fetch(url);',
  '```',
  '',
  '| Field | Meaning |',
  '|---|---|',
  '| `access_token` | The **token** |',
  '',
  '```json',
  '{ "ok": true }',
  '```',
  '',
  '<!--',
  '  a marker over',
  '  several lines',
  '-->',
  '<script>alert(1)</script> and [click](javascript:alert(1)) stay text.',
  '',
  '## Get a token',
].join('\n');

describe('MIG-336: guide markdown', () => {
  const blocks = parseGuide(FIXTURE);
  const kinds = blocks.map(b => b.kind);

  it('reads headings with GitHub-style anchors, numbering a repeat', () => {
    const headings = blocks.filter((b): b is Extract<GuideBlock, { kind: 'h' }> => b.kind === 'h');
    expect(headings.map(h => [h.level, h.id])).toEqual([[1, 'quickstart'], [2, 'get-a-token'], [2, 'get-a-token-1']]);
    expect(slugify('Verify the `Webhook-Signature`!')).toBe('verify-the-webhook-signature');
    expect(withoutTitle(blocks)[0].kind).toBe('p');
  });

  it('drops the markers, one line or several, wherever they are', () => {
    expect(JSON.stringify(blocks)).not.toContain('sample id');
    expect(JSON.stringify(blocks)).not.toContain('several lines');
  });

  it('makes one code group of bash, python and javascript blocks with only markers and blank lines between', () => {
    expect(kinds).toEqual(['h', 'p', 'h', 'group', 'table', 'code', 'p', 'h']);
    const group = blocks[3] as Extract<GuideBlock, { kind: 'group' }>;
    expect(group.tabs.map(t => [t.key, t.label])).toEqual([['curl', 'curl'], ['python', 'Python'], ['node', 'Node.js']]);
    expect(group.tabs[2].code).toBe('const res = await fetch(url);');
    // Another language is a block of its own.
    expect(blocks[5]).toEqual({ kind: 'code', lang: 'json', code: '{ "ok": true }' });
  });

  it('keeps one block of a language alone, and splits a run where a language repeats', () => {
    expect(parseGuide('```bash\na\n```\n\ntext\n\n```python\nb\n```').map(b => b.kind)).toEqual(['code', 'p', 'code']);
    const repeated = parseGuide('```sh\na\n```\n```bash\nb\n```\n```js\nc\n```');
    expect(repeated.map(b => b.kind)).toEqual(['code', 'group']);
  });

  it('reads tables with inline code and bold', () => {
    const table = blocks[4] as Extract<GuideBlock, { kind: 'table' }>;
    expect(table.head.map(c => c[0].text)).toEqual(['Field', 'Meaning']);
    expect(table.rows[0][0]).toEqual([{ text: 'access_token', code: true }]);
    expect(table.rows[0][1]).toContainEqual({ text: 'token', bold: true });
  });

  it('links only to safe places: the web, the console, a sibling guide', () => {
    expect(linkTarget('https://example.com/x')).toEqual({ href: 'https://example.com/x' });
    expect(linkTarget('/integration/developer/reference#op-startRun')).toEqual({ route: '/integration/developer/reference', fragment: 'op-startRun' });
    expect(linkTarget('webhooks.md#verify')).toEqual({ route: '/integration/developer/guides/webhooks', fragment: 'verify' });
    expect(linkTarget('#retries')).toEqual({ route: '.', fragment: 'retries' });
    expect(linkTarget('webhooks')).toEqual({ route: '/integration/developer/guides/webhooks' });
    expect(linkTarget('reference#op-startRun')).toEqual({ route: '/integration/developer/reference', fragment: 'op-startRun' });
    expect(linkTarget('../secrets/env')).toBeNull();
    expect(linkTarget('javascript:alert(1)')).toBeNull();
    expect(linkTarget('//evil.example.com')).toBeNull();
    expect(linkTarget('data:text/html,x')).toBeNull();
    const spans = parseSpans('[click](javascript:alert(1)) and `a *b*`');
    expect(spans[0]).toEqual({ text: 'click' });
    expect(spans.find(s => s.code)?.text).toBe('a *b*');
    expect(parseSpans('**`type`** says')[0]).toEqual({ text: 'type', code: true, bold: true });
  });
});

/** Every span of a block, wherever it sits (paragraphs, list items, table cells, headings). */
function spansOf(block: GuideBlock): Span[] {
  switch (block.kind) {
    case 'h': case 'p': case 'quote': return block.spans;
    case 'ul': case 'ol': return block.items.flat();
    case 'table': return [...block.head.flat(), ...block.rows.flat(2)];
    default: return [];
  }
}

describe('MIG-336: the bundled guides', () => {
  const slugs = new Set(DOCS.guides.map(g => g.slug));

  for (const guide of DOCS.guides) {
    it(`${guide.slug}: parses with its markers hidden and every guide link landing on a guide`, () => {
      const blocks = parseGuide(guide.markdown);
      expect(blocks[0], 'a guide starts with its # title').toMatchObject({ kind: 'h', level: 1 });
      expect(JSON.stringify(blocks)).not.toContain('<!--');
      const broken = blocks.flatMap(spansOf).filter(s => s.route?.startsWith('/integration/developer/guides/'))
        .map(s => s.route!.split('/').pop()!).filter(slug => !slugs.has(slug));
      expect(broken).toEqual([]);
    });
  }
});

@Component({ imports: [GuideBody], template: '<app-guide-body [blocks]="blocks()" />' })
class Host { readonly blocks = signal<GuideBlock[]>(parseGuide(FIXTURE)); }

describe('MIG-336: a guide drawn', () => {
  useMemoryStorage();
  beforeEach(() => localStorage.clear());

  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: ToastService, useValue: { success: () => undefined, error: () => undefined } },
    ] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('never renders markup or a marker from the markdown', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
    expect(el.textContent).not.toContain('sample id');
    expect([...el.querySelectorAll('a')].some(a => (a.getAttribute('href') ?? '').startsWith('javascript'))).toBe(false);
    const external = [...el.querySelectorAll('a[target="_blank"]')];
    expect(external.every(a => a.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
    expect(el.querySelector('a[href="/integration/developer/guides/webhooks#verify"]')).not.toBeNull();
    expect(el.querySelector('h2#get-a-token')).not.toBeNull();
    expect(el.querySelector('table.table-modern')).not.toBeNull();
  });

  it('shows one tab at a time, remembers the language across groups and visits, and copies', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const group = el.querySelector('[data-code-group]')!;
    const tabs = [...group.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map(t => t.textContent?.trim())).toEqual(['curl', 'Python', 'Node.js']);
    expect(group.querySelector('pre')!.textContent).toContain('curl -X POST');
    tabs[1].click();
    fixture.detectChanges();
    expect(group.querySelector('pre')!.textContent).toContain('import requests');
    expect(localStorage.getItem('devportal.lang')).toBe('python');
    expect(TestBed.inject(DevLangService).lang()).toBe('python');
    // A second visit starts on the language chosen.
    const again = render().nativeElement as HTMLElement;
    expect(again.querySelector('[data-code-group] pre')!.textContent).toContain('import requests');
    // Every block, grouped or not, has its copy button.
    expect(el.querySelectorAll('.md-code').length).toBe(2);
    expect(el.querySelectorAll('.md-code app-copy-button').length).toBe(2);
  });
});
