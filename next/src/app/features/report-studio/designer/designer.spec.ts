import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../../core/api/api.config';
import { ReportStudioApi } from '../report-studio.api';
import { TemplateDefinition } from '../report-studio.model';
import { neededFields, typeWords } from '../wizard/new-report';
import { CANVAS_ID, clean, idOf, splitCanvas } from './canvas-doc';
import {
  Block, PaletteEntry, allIds, canHold, cloneWithNewIds, collections, fieldsUsed, find, fromPalette, innerPath, insertBlock, itemFields,
  layerRows, lengthAt, moveBlock, newId, pageSizeMm, pagesOf, primaryNames, removeBlock, rulerMarks, scalars, valueAt,
  looksLikePicture, firstTextAt, typeIcon, typeWord,
} from './designer-model';
import { fieldsFor } from './properties';
import { wantsCanvas } from '../../shell/shell';

/** MIG-404: the designer's model, its canvas document, its property forms, Create report's fields, and their calls. */
function def(components: Block[], extra: Record<string, unknown> = {}): TemplateDefinition {
  return { schemaVersion: '1.0', template: { name: 'T', datasets: [{ id: 'primary', rootPath: '$' }], components, ...extra } };
}

const tree = (): Block[] => [
  { id: 'header', type: 'section', role: 'header', children: [{ id: 'brand', type: 'text', content: 'ACME' }] },
  { id: 'title', type: 'heading', level: 1, content: 'Monthly {{primary.period}}' },
  { id: 'kpis', type: 'row', children: [{ id: 'k1', type: 'column', width: '1/2', children: [{ id: 'kpi', type: 'labelValue', label: 'Rate', binding: 'primary.summary.rate' }] }] },
  { id: 'table', type: 'table', dataset: 'primary.by_department', columns: [{ id: 'c1', field: 'department' }, { id: 'c2', field: 'rate' }] },
  { id: 'pb', type: 'pageBreak' },
  { id: 'detail', type: 'heading', level: 2, content: 'Department detail' },
  { id: 'footer', type: 'section', role: 'footer', children: [{ id: 'pn', type: 'pageNumber' }] },
];

describe('the designer model', () => {
  it('guesses picture fields in generic words or by their values, never by a domain word', () => {
    const wound = { visits: [{ patient: 'P-1042', imageAfter: 'p-1042-after.jpg', note: 'Edges advancing' }],
      gallery: [{ image: 'p-1042-before.jpg', caption: 'before' }] };
    expect(looksLikePicture('visits[].imageAfter', 'string', wound)).toBe(true);           // found by its value
    expect(looksLikePicture('gallery[].image', 'string', wound)).toBe(true);               // by its name
    expect(looksLikePicture('latest[].image_key', 'string', {})).toBe(true);               // outcomes files: image_key
    expect(looksLikePicture('results[].thumbnail_path', 'string', {})).toBe(true);
    expect(looksLikePicture('visits[].note', 'string', wound)).toBe(false);
    expect(looksLikePicture('visits[].patient', 'string', wound)).toBe(false);
    expect(looksLikePicture('wound', 'string', { wound: 'stage 2' })).toBe(false);         // no domain words
    expect(looksLikePicture('api_key', 'string', { api_key: 'abc' })).toBe(false);         // "key" alone is not a picture
    expect(looksLikePicture('gallery[].image', 'number', wound)).toBe(false);
    expect(firstTextAt([{ a: [{ b: 'x.png' }] }], 'a[].b')).toBe('x.png');
  });

  it('cuts the body into pages at its page breaks, named by their first heading', () => {
    const pages = pagesOf(tree());
    expect(pages.map(p => p.title)).toEqual(['Monthly …', 'Department detail']);
    expect(pages[0].blockIds).toEqual(['title', 'kpis', 'table']);
    expect(pages[1].breakId).toBe('pb');
  });

  it('adds, moves and removes blocks only where the schema allows them', () => {
    const blocks = tree();
    const taken = allIds(blocks);
    expect(newId('labelValue', taken)).toBe('labelValue-1');
    const text = fromPalette({ type: 'text', group: 'Text', label: 'Text', description: '', defaults: { content: 'x' } } as PaletteEntry, taken);
    expect(insertBlock(blocks, 'k1', 0, text)).toBe(true);
    expect(find(blocks, text.id)?.parent?.id).toBe('k1');
    expect(insertBlock(blocks, 'kpis', 0, { id: 'z', type: 'text' })).toBe(false);
    expect(canHold(null, { id: 'c', type: 'column' })).toBe(false);
    expect(canHold(find(blocks, 'kpis')!.block, { id: 'c', type: 'column' })).toBe(true);
    expect(canHold(find(blocks, 'header')!.block, { id: 'p', type: 'pageBreak' })).toBe(false);
    expect(moveBlock(blocks, 'kpis', 'k1', 0)).toBe(false);
    expect(moveBlock(blocks, 'table', null, 1)).toBe(true);
    expect(blocks.map(b => b.id).slice(0, 3)).toEqual(['header', 'table', 'title']);
    expect(removeBlock(blocks, 'kpis')).toBe(true);
    expect(find(blocks, 'kpi')).toBeNull();
    const copy = cloneWithNewIds(find(blocks, 'footer')!.block, allIds(blocks));
    expect(copy.id).not.toBe('footer');
    expect(copy.children![0].id).not.toBe('pn');
  });

  it('lets a conditional or repeated block hold blocks, but not in a header or footer (phase 4)', () => {
    const repeat = { id: 'r', type: 'repeat', dataset: 'primary.rows', children: [] } as Block;
    const cond = { id: 'c', type: 'conditional', when: 'true', children: [] } as Block;
    const table = { id: 't', type: 'table', dataset: 'primary.rows', columns: [] } as Block;
    const header = { id: 'h', type: 'section', role: 'header', children: [] } as Block;
    expect(canHold(repeat, table)).toBe(true);
    expect(canHold(cond, repeat)).toBe(true);
    expect(canHold(header, repeat)).toBe(false);
    expect(canHold(repeat, { id: 'col', type: 'column', children: [] } as Block)).toBe(false);
    expect(typeWord('qrCode')).toBe('QR code');
    expect(typeIcon('metric')).toBe('trendingUp');
  });

  it('lists layers in tree order and counts the data fields the template reads', () => {
    expect(layerRows(tree()).map(r => `${r.depth}:${r.id}`).slice(0, 6)).toEqual(['0:header', '1:brand', '0:title', '0:kpis', '1:k1', '2:kpi']);
    expect(fieldsUsed(tree())).toBe(5);
  });

  it('reads bindings, schema paths and sample values without guessing', () => {
    const d = def([], { datasets: [{ id: 'sales', sourceAlias: 'primary', rootPath: '$' }], dataContract: { primaryDataset: 'sales' } });
    expect(primaryNames(d)).toEqual(['sales', 'primary']);
    expect(innerPath('primary.summary.rate', ['sales', 'primary'])).toBe('summary.rate');
    expect(innerPath('other.x', ['sales'])).toBeNull();
    const schema = [{ path: 'period', type: 'string', nullable: false }, { path: 'by_department', type: 'list', nullable: false },
      { path: 'by_department[].rate', type: 'number', nullable: false }, { path: 'summary', type: 'object', nullable: false },
      { path: 'summary.rate', type: 'number', nullable: false }];
    expect(collections(schema).map(f => f.path)).toEqual(['by_department']);
    expect(itemFields(schema, 'by_department').map(f => f.path)).toEqual(['rate']);
    expect(scalars(schema).map(f => f.path)).toEqual(['period', 'summary.rate']);
    const sample = { period: 'Sep', summary: { rate: 0.1 }, by_department: [{ rate: 0.2 }] };
    expect(valueAt(sample, 'summary.rate')).toBe(0.1);
    expect(valueAt(sample, 'by_department[].rate')).toBe(0.2);
    expect(valueAt(sample, 'missing.path')).toBeUndefined();
    expect(lengthAt({ path: '$', type: 'object', children: [{ path: '$.by_department', type: 'list', length: 5 }] }, 'by_department')).toBe(5);
  });

  it('sizes the page and its ruler from the page setup', () => {
    expect(pageSizeMm(def([], { page: { size: 'A4', orientation: 'landscape' } }))).toEqual({ width: 297, height: 210 });
    const marks = rulerMarks(210);
    expect(marks.filter(m => m.label).map(m => m.label)).toEqual(['0', '50', '100', '150', '210']);
  });
});

describe('the canvas document', () => {
  const html = `<!DOCTYPE html><html><head><style>.rs-h1 { color: #123456; }</style></head><body><div class="rs-sheet">
    <div class="rs-header rs-doc ${CANVAS_ID}header"><div class="rs-text ${CANVAS_ID}brand">ACME</div></div>
    <div class="rs-doc rs-body"><div class="rs-h1 ${CANVAS_ID}title" onclick="x()">One</div><div class="rs-pagebreak ${CANVAS_ID}pb"></div>
      <div class="rs-h2 ${CANVAS_ID}detail">Two<script>alert(1)</script><a href="javascript:alert(1)">l</a></div></div>
    <div class="rs-footer rs-doc ${CANVAS_ID}footer">F</div></div></body></html>`;

  it('cuts the compiled HTML into pages with the header and footer on each, and keeps the stylesheet', () => {
    const doc = splitCanvas(html);
    expect(doc.css).toContain('.rs-h1');
    expect(doc.pages.length).toBe(2);
    expect(doc.pages[0]).toContain('One');
    expect(doc.pages[0]).not.toContain('Two');
    expect(doc.pages[1]).toContain('Two');
    for (const p of doc.pages) expect(p).toContain(`${CANVAS_ID}header`);
    for (const p of doc.pages) expect(p).toContain(`${CANVAS_ID}footer`);
  });

  it('draws nothing that runs: no script, no event attribute, no javascript: address', () => {
    const doc = splitCanvas(html);
    const all = doc.pages.join('');
    expect(all).not.toContain('<script');
    expect(all).not.toContain('onclick');
    expect(all).not.toContain('javascript:');
    const root = new DOMParser().parseFromString('<div><img src="https://example.com/x.png" onerror="y()"><img src="data:image/png;base64,AA"></div>', 'text/html');
    clean(root);
    expect(root.body.innerHTML).toBe('<div><img><img src="data:image/png;base64,AA"></div>');
    const el = root.createElement('div');
    el.className = `rs-text ${CANVAS_ID}abc`;
    expect(idOf(el)).toBe('abc');
  });

  it('keeps the server\'s figures (inline SVG shapes) and nothing else an svg could carry', () => {
    // Live 10-20: the cleaner dropped every svg, so charts, KPI tiles and QR codes were blank on the canvas.
    const root = new DOMParser().parseFromString(`<div class="rs-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
      <title>Chart</title><desc>Visits by month.</desc><rect x="0" y="0" width="5" height="5" fill="#0F766E"></rect>
      <path d="M0 0L5 5" stroke="#1F2933"></path><circle cx="1" cy="1" r="1"></circle><line x1="0" y1="0" x2="1" y2="1"></line>
      <text x="1" y="9" font-size="2">Jan</text>
      <script>alert(1)</script><foreignObject><div>x</div></foreignObject><use href="#a"></use><image href="https://example.com/x.png"></image>
      <a href="https://example.com"><text>link</text></a><animate attributeName="x"></animate><style>rect{fill:red}</style>
      <rect style="fill:url(https://example.com/x)" fill="url(https://example.com/p)" onclick="y()" width="1" height="1"></rect>
      <svg><rect></rect></svg></svg></div>`, 'text/html');
    clean(root);
    const svg = root.querySelector('svg')!;
    expect(svg).not.toBeNull();
    expect(Array.from(svg.querySelectorAll('*')).map(e => e.localName).sort())
      .toEqual(['circle', 'desc', 'line', 'path', 'rect', 'rect', 'text', 'title']);
    const last = svg.querySelectorAll('rect')[1];
    expect(Array.from(last.attributes).map(a => a.name).sort()).toEqual(['height', 'width']);
    expect(svg.querySelector('text')!.textContent).toBe('Jan');
  });

  it('keeps a first-page-only watermark off the later pages', () => {
    const marked = html.replace('<div class="rs-header', '<div class="rs-watermark rs-watermark--first" aria-hidden="true"><span>DRAFT</span></div><div class="rs-header');
    const doc = splitCanvas(marked);
    expect(doc.pages.length).toBe(2);
    expect(doc.pages[0]).toContain('DRAFT');
    expect(doc.pages[1]).not.toContain('DRAFT');
    const every = splitCanvas(html.replace('<div class="rs-header', '<div class="rs-watermark" aria-hidden="true"><span>COPY</span></div><div class="rs-header'));
    for (const p of every.pages) expect(p).toContain('COPY');
  });
});

describe('the properties panel', () => {
  it('draws a component\'s settings from the template schema, grouped', () => {
    const definitions = {
      tableComponent: { properties: { id: {}, type: {}, name: { type: 'string' }, title: { type: 'string', maxLength: 200 }, dataset: { type: 'string' },
        columns: { type: 'array' }, maxRows: { type: 'integer', minimum: 1, maximum: 100000 }, keepTogether: { type: 'boolean' },
        size: { $ref: '#/definitions/size' }, style: { $ref: '#/definitions/style' } } },
      headingComponent: { properties: { level: { type: 'integer', minimum: 1, maximum: 3 }, format: { $ref: '#/definitions/format' }, binding: { type: 'string' } } },
    };
    const table = fieldsFor('table', definitions);
    expect(table.map(f => `${f.group}:${f.key}:${f.kind}`)).toEqual(['content:name:text', 'content:title:text', 'data:dataset:collection',
      'data:columns:columns', 'data:maxRows:number', 'layout:keepTogether:boolean', 'layout:size:size', 'style:style:style']);
    const heading = fieldsFor('heading', definitions);
    expect(heading.find(f => f.key === 'level')).toEqual(expect.objectContaining({ kind: 'enum', options: ['1', '2', '3'] }));
    expect(heading.find(f => f.key === 'binding')?.kind).toBe('binding');
    expect(fieldsFor('unknown', definitions)).toEqual([]);
  });
});

describe('Create report', () => {
  it('needs the data contract\'s fields, or what the template binds when it has none', () => {
    const withContract = def([], { dataContract: { fields: [{ path: 'period', type: 'string', required: true }, { path: 'notes', type: 'string' }] } });
    expect(neededFields(withContract)).toEqual([{ path: 'period', type: 'string', required: true }, { path: 'notes', type: 'string', required: false }]);
    expect(neededFields(def(tree())).map(f => `${f.path}:${f.type}`)).toEqual(['summary.rate:string', 'by_department:array']);
    expect(typeWords('array', 5)).toBe('List · 5 rows');
    expect(typeWords('integer')).toBe('Whole number');
  });
});

describe('the designer\'s calls', () => {
  it('draws on the canvas, asks for approval and reads thumbnails and contracts on their own prefixes', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ReportStudioApi);
    const http = TestBed.inject(HttpTestingController);
    api.canvas({ definition: {} }).subscribe();
    api.requestApproval('T1', 4, 'ready').subscribe();
    api.templateThumbnail('T1').subscribe();
    api.reportThumbnail('R1', 2).subscribe();
    api.contracts().subscribe();
    api.components().subscribe();
    http.expectOne(`${API_BASE}/reportPreview.json/canvas`).flush({ status: 'SUCCESS', data: { problems: [], summary: {} } });
    const ask = http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/requestApproval`);
    expect(ask.request.body).toEqual({ revision: 4, note: 'ready' });
    ask.flush({ status: 'SUCCESS', data: {} });
    http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/thumbnail` && r.params.get('templateId') === 'T1').flush(new Blob());
    http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/thumbnail` && r.params.get('version') === '2').flush(new Blob());
    http.expectOne(`${API_BASE}/reportTemplate.json/contracts`).flush({ status: 'SUCCESS', data: { templates: [] } });
    http.expectOne(`${API_BASE}/reportStudio.json/components`).flush({ status: 'SUCCESS', data: [] });
    http.verify();
  });

  it('folds the sidebar only on a page whose route asks for the whole width', () => {
    const child = { data: { canvas: true }, firstChild: null };
    const root = { data: {}, firstChild: { data: {}, firstChild: child } };
    expect(wantsCanvas(root as never)).toBe(true);
    expect(wantsCanvas({ data: {}, firstChild: null } as never)).toBe(false);
  });
});
