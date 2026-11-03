import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '../../core/api/api.config';
import { ReportComments, anchorWords, pinsOf } from './report-comments';
import { ReviewComments } from './report-library.api';
import { TemplateComments } from './designer/template-comments';
import { advancedSelects } from '../../shared/ui/advanced-select.testing';

/**
 * Reports redesign, feature 16: the comment threads beside a report version -- pinned to a page point or a block, masked
 * words as the server sends them, mentions, replies, resolving -- and the designer's list of comments about its blocks.
 * Synthetic Riverside wound report.
 */
const REPORT = '01JC0000000000000000000001';
const comments = (over: Partial<ReviewComments> = {}): ReviewComments => ({
  reportId: REPORT, version: 2, label: 'RPT-0109', masked: true, open: 1, total: 2,
  may: { comment: true, resolveAny: false },
  blocks: [{ id: 'h', type: 'heading', label: 'heading h' }, { id: 'labs', type: 'table', label: 'Lab values' }],
  threads: [
    { commentId: 'C1', version: 2, text: '••• area does not match the photo', masked: true, about: 'REPORT', authorId: 1016, authorName: 'Dr Dana Reviewer',
      createdAt: '2026-11-03T09:12:00Z', page: 2, x: 0.4, y: 0.3, mentions: [{ userId: 1015, name: 'Riverside Admin' }], mayResolve: false,
      replies: [{ commentId: 'C2', version: 2, text: 'Re-measured.', masked: false, about: 'REPORT', authorId: 1015, authorName: 'Riverside Admin',
        createdAt: '2026-11-03T09:30:00Z', replyTo: 'C1', mentions: [] }] },
    { commentId: 'C3', version: 2, text: 'Unit missing', masked: false, about: 'TEMPLATE', authorId: 1016, authorName: 'Dr Dana Reviewer',
      createdAt: '2026-11-02T09:12:00Z', componentId: 'labs', componentLabel: 'Lab values', mentions: [], resolvedAt: '2026-11-03T10:00:00Z',
      resolvedByName: 'Riverside Admin' },
  ],
  ...over,
});

function panel(data: ReviewComments | null = comments()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ReportComments], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  const fixture = TestBed.createComponent(ReportComments);
  fixture.componentRef.setInput('reportId', REPORT);
  fixture.componentRef.setInput('version', 2);
  fixture.componentRef.setInput('data', data);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.match(r => r.url.endsWith('/commentPeople')).forEach(r => r.flush({ status: 'SUCCESS', data: { people: [{ userId: 1016, name: 'Dr Dana Reviewer' }] } }));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el, c: fixture.componentInstance };
}

describe('review comments beside a report version (feature 16)', () => {
  it('shows the open threads with their place, the masked words as sent and a note on why, and the resolved ones apart', () => {
    const { el, c, fixture } = panel();
    expect(el.querySelector('[data-comments-masked]')?.textContent).toContain('reading them needs See personal data');
    const threads = el.querySelectorAll('[data-thread]');
    expect(threads).toHaveLength(1);
    expect(threads[0].textContent).toContain('Page 2');
    expect(threads[0].textContent).toContain('••• area does not match the photo');
    expect(threads[0].textContent).toContain('Re-measured.');
    expect(threads[0].textContent).toContain('@Riverside Admin');
    expect([...threads[0].querySelectorAll('button')].some(b => b.textContent!.includes('Resolve'))).toBe(false);
    c.resolvedShown.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-thread]')!.textContent).toContain('Resolved by Riverside Admin');
    expect(el.querySelector('[data-thread]')!.textContent).toContain('Lab values');
  });

  it('pins a new comment where the page was clicked, with a mention, and reads the answer', () => {
    const { el, c, http, fixture } = panel();
    c.anchor.set({ page: 2, x: 0.25, y: 0.5 });
    c.text.set('P-1042 dressing date is wrong');
    fixture.detectChanges();
    expect(el.querySelector('[data-comment-anchor]')?.textContent).toContain('Page 2');
    advancedSelects(fixture).find(s => s.ariaLabel() === 'Mention someone')!.choose('1016');
    fixture.detectChanges();
    c.post();
    const req = http.expectOne(`${API_BASE}/reportLibrary.json/comment`);
    expect(req.request.body).toEqual({ reportId: REPORT, version: 2, text: 'P-1042 dressing date is wrong', mentions: [1016], page: 2, x: 0.25, y: 0.5 });
    req.flush({ status: 'SUCCESS', data: comments({ open: 2 }) });
    expect(c.anchor()).toBeNull();
    expect(c.text()).toBe('');
    expect(c.data()!.open).toBe(2);
  });

  it('pins to a block about the template, replies, and resolves', () => {
    const { c, http } = panel(comments({ threads: [{ ...comments().threads[0], mayResolve: true }] }));
    c.where.set('block');
    c.block.set('labs');
    c.aboutTemplate.set(true);
    c.text.set('Show the unit beside each value');
    expect(c.ready()).toBe(true);
    c.post();
    expect(http.expectOne(`${API_BASE}/reportLibrary.json/comment`).request.body).toEqual({ reportId: REPORT, version: 2,
      text: 'Show the unit beside each value', mentions: [], componentId: 'labs', about: 'TEMPLATE' });
    c.reply.set('Done in v3.');
    c.sendReply(c.data()!.threads[0]);
    expect(http.expectOne(`${API_BASE}/reportLibrary.json/comment`).request.body).toEqual({ reportId: REPORT, version: 2, text: 'Done in v3.', replyTo: 'C1' });
    c.resolveThread(c.data()!.threads[0]);
    expect(http.expectOne(`${API_BASE}/reportLibrary.json/commentResolve`).request.body).toEqual({ commentId: 'C1' });
  });

  it('does not let a comment go without its words or its place, and says why a version takes none', () => {
    const { c, el, fixture } = panel(comments({ may: { comment: false, resolveAny: false, why: "The version's files were removed by the workspace's retention policy; its comments went with them." } }));
    expect(el.querySelector('form[aria-label="New comment"]')).toBeNull();
    expect(el.textContent).toContain('retention policy');
    fixture.componentRef.setInput('data', comments());
    fixture.detectChanges();
    c.text.set('Something');
    expect(c.ready()).toBe(false);
    c.anchor.set({ page: 1, x: 0.1, y: 0.1 });
    expect(c.ready()).toBe(true);
  });

  it('reads the comments itself when the page has not, and says when they cannot be read', () => {
    const { http, c } = panel(null);
    http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/comments` && r.params.get('version') === '2')
      .flush({ status: 'ERROR', message: 'No such report.' }, { status: 404, statusText: 'Not found' });
    expect(c.loadError()).toBeTruthy();
  });

  it('numbers the pins of the open threads and names a place', () => {
    expect(pinsOf(comments(), false)).toEqual([{ id: 'C1', n: 1, page: 2, x: 0.4, y: 0.3, open: true }]);
    expect(pinsOf(comments(), true)).toHaveLength(1);
    expect(anchorWords(comments().threads[1])).toBe('Lab values');
    expect(anchorWords(comments().threads[0])).toBe('Page 2');
  });
});

describe('review comments about a template in the designer (feature 16)', () => {
  it('lists them over the canvas, selects a block still in the draft, and links to the report', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [TemplateComments], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TemplateComments);
    fixture.componentRef.setInput('blocks', [{ id: 'labs', type: 'table' }]);
    fixture.componentRef.setInput('comments', [
      { ...comments().threads[1], resolvedAt: undefined, reportLabel: 'RPT-0109', templateVersion: 3, link: `/reports/library/${REPORT}?version=2&comment=C3` },
      { ...comments().threads[1], commentId: 'C9', componentId: 'gone', componentLabel: 'Old notes', reportLabel: 'RPT-0110', templateVersion: 2,
        link: `/reports/library/${REPORT}?version=1&comment=C9` },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain("2 open review comments about this template's blocks");
    const picked: string[] = [];
    fixture.componentInstance.selected.subscribe(id => picked.push(id));
    const rows = el.querySelectorAll<HTMLButtonElement>('.tcm-what');
    rows[0].click();
    expect(rows[1].disabled).toBe(true);
    expect(picked).toEqual(['labs']);
    const link = el.querySelector('a.link-inline') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`/reports/library/${REPORT}?version=2&comment=C3`);
  });
});
