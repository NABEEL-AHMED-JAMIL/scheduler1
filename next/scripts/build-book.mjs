#!/usr/bin/env node
// The client PDF books, laid out from the help centre's own source (owner 2026-10-26; etl-platform
// docs/showcase/guide-outline.md, "The source: the help centre's Markdown"). Two books (owner's choice):
//   guide     "ETL Console · Client guide": chapters 1-20
//   workbook  "ETL Console · Build and test workbook": the recipes (part 1) and the manual test guide (part 2)
// A cross-reference into the other book reads "(Workbook, page N)" or "(Client guide, page N)".
//
//   node scripts/build-book.mjs [--book guide|workbook|both] [--out-dir <dir>] [--html-only] [--console http://localhost:4400]
//
// Reads public/help/content.json (node scripts/build-help.mjs makes it from help/), each article parsed with
// src/app/features/docs/help-markdown.ts (Node strips its types), the figures in public/help/img and each topic's
// shots.json (a figure marked "retake" prints as "Picture to come"). Writes one HTML book (scripts/book/book.css, A4,
// running heads from named pages) and prints it with the headless Chromium Playwright already has -- twice: the first
// pass finds the page every chapter and article lands on (pdfjs-dist reads the markers back), the second writes those
// numbers into the contents and the cross-references. The menu table of the Reference article is read from the running
// console's help page (--console), else the book says where to find it.
//
// Re-run it after the retakes: nothing in it is hand-edited. Default output: test-results/book/ (git-ignored).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.removeAllListeners('warning');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const workDir = resolve(opt('out-dir', join(root, 'test-results/book')));
const consoleBase = opt('console', 'http://localhost:4400');
mkdirSync(workDir, { recursive: true });
const which = opt('book', 'both');

const { parseHelp } = await import(pathToFileURL(join(root, 'src/app/features/docs/help-markdown.ts')).href);
const content = JSON.parse(readFileSync(join(root, 'public/help/content.json'), 'utf8'));
const articles = new Map(content.articles.map(a => [a.id, a]));
for (const a of content.articles) for (const al of a.aliases ?? []) if (!articles.has(al)) articles.set(al, a);
/** The two books, what each holds, and how a reference into it from the other reads. */
const BOOKS = {
  guide: { title: 'Client guide', ref: 'Client guide', file: 'ETL-Console-Client-Guide-Edition-1.pdf', cover: 'rs-report-page',
    sub: 'Build, run and review data pipelines, documents, reports and approvals', holds: t => t.chapter <= 20 },
  workbook: { title: 'Build and test workbook', ref: 'Workbook', file: 'ETL-Console-Build-and-Test-Workbook-Edition-1.pdf',
    cover: 'rcp-j-registration-steps', sub: 'Recipes that build every worked example from an empty workspace, and a numbered checklist to test it',
    holds: t => t.chapter > 20 },
};
const bookOfTopic = id => Object.keys(BOOKS).find(b => BOOKS[b].holds(content.topics.find(t => t.id === id)));
/** Page numbers per book, from the first pass (or an earlier run's pages-<book>.json): marker id -> page. */
const pagesBy = { guide: {}, workbook: {} };
for (const b of Object.keys(BOOKS)) {
  const f = join(workDir, `pages-${b}.json`);
  if (existsSync(f)) pagesBy[b] = JSON.parse(readFileSync(f, 'utf8'));
}
let current = 'guide';
const retake = new Set();
for (const d of readdirSync(join(root, 'help'))) {
  const f = join(root, 'help', d, 'shots.json');
  if (existsSync(f)) for (const s of JSON.parse(readFileSync(f, 'utf8'))) if (s.retake) retake.add(s.name);
}

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const anchor = id => `a-${id.replace(/[^\w-]/g, '-')}`;
const pageOf = (id, book = current) => pagesBy[book][id] ?? null;

function spans(list) {
  return (list ?? []).map(s => {
    let t = esc(s.text);
    if (s.code) t = `<code>${t}</code>`;
    if (s.bold) t = `<strong>${t}</strong>`;
    if (s.italic) t = `<em>${t}</em>`;
    if (s.article) {
      const [art] = s.article.split('--');
      const a = articles.get(art);
      if (!a) return t;
      const there = bookOfTopic(a.topic);
      const p = pageOf(`a:${a.id}`, there);
      if (there !== current) return `${t}<span class="pref"> (${BOOKS[there].ref}${p ? `, page ${p}` : ''})</span>`;
      return `<a href="#${anchor(a.id)}">${t}</a><span class="pref"> (page ${p ?? '000'})</span>`;
    }
    if (s.href && /^https?:/.test(s.href)) return `<a href="${esc(s.href)}">${t}</a>`;
    if (s.href) return `${t}<span class="pref"> (download: ${esc(s.href)})</span>`;
    return t;
  }).join('');
}

function figure(b) {
  const f = content.figures[b.name];
  const caption = b.caption || b.alt;
  if (!f || retake.has(b.name)) {
    return `<figure class="fig todo"><div class="todo-box"><span>Picture to come</span><small>${esc(b.alt)}</small></div>`
      + (caption ? `<figcaption>${esc(caption)}</figcaption>` : '') + '</figure>';
  }
  const img = printImage(b.name);
  const [w, h] = img.size ?? f;
  // A full screen without the console's frame prints at the whole text width, so its small text reads; a screen kept
  // whole (the designer, the help) a little narrower; a panel or a dialog at its own share; never taller than most of a page.
  const widthMm = img.cropped ? 168 : Math.min(155, Math.max(55, f[0] * 0.12));
  const heightMm = widthMm * h / w;
  const scale = heightMm > 125 ? 125 / heightMm : 1;
  return `<figure class="fig${img.cropped ? ' framed' : ''}"><img src="${img.src}" alt="${esc(b.alt)}" style="width:${(widthMm * scale).toFixed(1)}mm" />`
    + (caption ? `<figcaption>${esc(caption)}</figcaption>` : '') + '</figure>';
}

/**
 * A figure for paper (scripts/book/print-image.py): a 2000-pixel JPEG, about 300 dpi at the text width, so the PDF stays
 * a size people can send; a full console screen loses the console's own frame (the menu and the top bar) so what the
 * article is about prints larger. Made once, kept beside the PDF (print-img/). Without dwebp, Python or Pillow the WebP
 * is used whole.
 */
const printed = new Map();
function printImage(name) {
  if (printed.has(name)) return printed.get(name);
  const webp = join(root, 'public/help/img', `${name}.webp`);
  const dir = join(workDir, 'print-img');
  const jpg = join(dir, `${name}.jpg`);
  const meta = join(dir, `${name}.json`);
  let out;
  try {
    if (!existsSync(jpg) || !existsSync(meta)) {
      mkdirSync(dir, { recursive: true });
      const png = join(dir, `${name}.png`);
      execFileSync('dwebp', ['-quiet', webp, '-o', png]);
      const how = execFileSync('python3', [join(root, 'scripts/book/print-image.py'), png, jpg], { encoding: 'utf8' }).trim();
      execFileSync('rm', ['-f', png]);
      const size = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', jpg], { encoding: 'utf8' });
      const wpx = Number(/pixelWidth: (\d+)/.exec(size)?.[1]); const hpx = Number(/pixelHeight: (\d+)/.exec(size)?.[1]);
      writeFileSync(meta, JSON.stringify({ cropped: how === 'cropped', size: [wpx, hpx] }));
    }
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    out = { src: pathToFileURL(jpg).href, cropped: m.cropped, size: m.size };
  } catch {
    out = { src: pathToFileURL(webp).href, cropped: false, size: null };
  }
  printed.set(name, out);
  return out;
}

let menuTable = '';
function blocks(list, shift = 1) {
  const out = [];
  for (const b of list) {
    switch (b.kind) {
      case 'h': { const l = Math.min(6, b.level + shift); out.push(`<h${l}>${spans(b.spans)}</h${l}>`); break; }
      case 'p': out.push(`<p>${spans(b.spans)}</p>`); break;
      case 'callout': out.push(`<div class="callout ${b.tone}"><p><b>${b.tone === 'warn' ? 'Caution' : esc(b.label)}.</b> ${b.paras.map(spans).join('</p><p>')}</p></div>`); break;
      case 'ul': case 'ol':
        out.push(`<${b.kind}${b.start ? ` start="${b.start}"` : ''}>${b.items.map(it => `<li>${spans(it.spans)}${it.sub ? `<${it.sub.ordered ? 'ol' : 'ul'}>${it.sub.items.map(s => `<li>${spans(s)}</li>`).join('')}</${it.sub.ordered ? 'ol' : 'ul'}>` : ''}</li>`).join('')}</${b.kind}>`);
        break;
      case 'code': out.push(`<div class="code"><div class="code-label">${esc(b.label)}</div><pre>${esc(b.code)}</pre></div>`); break;
      case 'table': {
        const checks = b.head.some(c => /pass\s*\/\s*fail/i.test(c.map(s => s.text).join('')));
        out.push(`<table class="${checks ? 'checks' : ''}"><thead><tr>${b.head.map(c => `<th>${spans(c)}</th>`).join('')}</tr></thead><tbody>`
          + b.rows.map(r => `<tr>${r.map((c, i) => {
            const text = c.map(s => s.text).join('');
            if (checks && i === r.length - 1 && /☐/.test(text)) return '<td class="box"><span class="tick"></span> Pass<br><span class="tick"></span> Fail</td>';
            return `<td>${spans(c)}</td>`;
          }).join('')}</tr>`).join('') + '</tbody></table>');
        break;
      }
      case 'figure': out.push(figure(b)); break;
      case 'widget': out.push(b.name === 'menu-map' && menuTable ? menuTable
        : '<p class="muted">The menu as your console shows it is in the help centre (Glossary and reference › Reference).</p>'); break;
      case 'hr': out.push('<hr />'); break;
    }
  }
  return out.join('\n');
}

function book(id) {
  current = id;
  const B = BOOKS[id];
  const topics = content.topics.filter(B.holds);
  // The workbook's two chapters are its parts 1 and 2; the guide keeps the help's chapter numbers.
  const num = t => (id === 'workbook' ? topics.indexOf(t) + 1 : t.chapter);
  const partOf = t => (id === 'workbook' ? `Part ${num(t)}` : t.part);
  const toc = [];
  let lastPart = '';
  for (const t of topics) {
    if (partOf(t) !== lastPart) { toc.push(`<li class="toc-part">${esc(partOf(t))}</li>`); lastPart = partOf(t); }
    toc.push(`<li class="toc-ch"><a href="#${anchor('ch-' + t.id)}"><span class="n">${num(t)}</span><span class="t">${esc(t.title)}</span>`
      + `<span class="p">${pageOf(`c:${t.id}`) ?? '000'}</span></a></li>`);
    for (const id of t.articles) {
      const a = articles.get(id);
      toc.push(`<li class="toc-a"><a href="#${anchor(a.id)}"><span class="t">${esc(a.title)}</span><span class="p">${pageOf(`a:${a.id}`) ?? '000'}</span></a></li>`);
    }
  }
  const css = readFileSync(join(root, 'scripts/book/book.css'), 'utf8');
  const named = topics.map(t => `@page ch${t.chapter} { @top-right { content: "${id === 'workbook' ? 'Part ' : ''}${num(t)} · ${t.title.replace(/"/g, '\\"')}"; } }`).join('\n')
    + `\n@page { @top-left { content: "ETL Console · ${B.title}"; } }`;
  const cover = content.figures[B.cover] ? printImage(B.cover).src : '';
  const words = topics.reduce((n, t) => n + t.articles.length, 0);
  const chapters = topics.map(t => {
    const opener = t.start.find(s => s.figure && content.figures[s.figure] && !retake.has(s.figure));
    return `<section class="chapter" style="page: ch${t.chapter}" id="${anchor('ch-' + t.id)}">
      <div class="opener">
        <p class="mark">⟦c:${esc(t.id)}⟧</p>
        <p class="part">${esc(id === 'workbook' ? `Build and test workbook · Part ${num(t)}` : t.part)}</p>
        <p class="chno">${num(t)}</p>
        <h1>${esc(t.title)}</h1>
        <div class="lead">${blocks(parseHelp(t.summary), 1)}</div>
        <div class="inchapter"><p class="eyebrow">In this chapter</p><ol>${t.articles.map(id => { const a = articles.get(id);
          return `<li><span>${esc(a.title)}</span><span class="p">${pageOf(`a:${a.id}`) ?? '000'}</span></li>`; }).join('')}</ol></div>
        ${opener ? `<figure class="fig opener-fig"><img src="${printImage(opener.figure).src}" alt="" /></figure>` : ''}
      </div>
      ${t.articles.map(id => { const a = articles.get(id); return `<article id="${anchor(a.id)}">
        <header class="ahead">
        <h2><span class="mark">⟦a:${esc(a.id)}⟧</span>${esc(a.title)}</h2>
        <p class="summary">${esc(a.summary)}</p>
        ${a.who || a.where?.length ? `<dl class="meta">${a.who ? `<dt>Who</dt><dd>${esc(a.who)}</dd>` : ''}${a.where?.length ? `<dt>Where</dt><dd>${a.where.map(w => esc(w.label)).join(' · ')}</dd>` : ''}</dl>` : ''}
        </header>
        ${blocks(parseHelp(a.md, a.id), 1)}
      </article>`; }).join('\n')}
      ${t.faq.length ? `<section class="faq"><h2>Questions about ${esc(t.title)}</h2>${t.faq.map(q => `<h3>${esc(q.q)}</h3>${blocks(parseHelp(q.md), 2)}`).join('')}</section>` : ''}
    </section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ETL Console · ${B.title} · Edition 1</title>
<style>${css}\n${named}</style></head><body>
<section class="cover">
  <div class="band"></div>
  <p class="brand">ETL Console</p>
  <h1>${esc(B.title)}</h1>
  <p class="sub">${esc(B.sub)}</p>
  ${cover ? `<img class="cover-fig" src="${cover}" alt="" />` : ''}
  <p class="edition">Edition 1 · October 2026</p>
</section>
<section class="copyright">
  <p><b>ETL Console · ${esc(B.title)}</b><br>Edition 1, October 2026</p>
  <p class="big">Every example is fictional and its data synthetic.</p>
  <p>Summit Valley Health System, Riverside Health and every person, patient, provider, payer and number in this book are
  made up. Screens show test accounts and synthetic records. A model's answer shown in this book is a draft for a person
  to check, never a decision.</p>
  <p>Meeting your organisation's privacy and regulatory obligations depends on how you configure and use the console; the
  console does not by itself make a workspace compliant with any law or standard.</p>
  <p>This book is printed from the same source as the console's help centre (Help centre in the account menu), which is
  always the latest edition: ${topics.length} ${id === 'workbook' ? 'parts' : 'chapters'}, ${words} sections.
  ${id === 'workbook' ? 'Its companion, the Client guide, explains every screen; a reference to it reads "(Client guide, page N)".'
    : 'Its companion, the Build and test workbook, builds every worked example and tests it; a reference to it reads "(Workbook, page N)".'}
  The sample files the recipes use download from the help centre. Pictures marked "Picture to come" are being retaken for
  the next printing.</p>
</section>
<section class="contents"><h1>Contents</h1><ol class="toc">${toc.join('\n')}</ol></section>
${chapters}
</body></html>`;
}

async function markersOf(pdfPath) {
  const pdfjs = await import(pathToFileURL(join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), verbosity: 0 }).promise;
  const found = {};
  for (let n = 1; n <= doc.numPages; n++) {
    const text = (await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join('');
    for (const m of text.matchAll(/⟦([ac]):([\w-]+)⟧/g)) found[`${m[1]}:${m[2]}`] ??= n;
  }
  return { found, count: doc.numPages };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // The Reference article's live menu: the help page draws it from the console's own menu.
  try {
    await page.goto(`${consoleBase}/docs#gl-reference`, { waitUntil: 'networkidle', timeout: 20_000 });
    const table = await page.locator('[data-test="doc-menu"] table').first().evaluate(t => t.outerHTML).catch(() => '');
    menuTable = table.replace(/<a [^>]*>/g, '').replace(/<\/a>/g, '').replace(/ (class|data-test|_ngcontent-[\w-]+|ng-reflect-[\w-]+)="[^"]*"/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  } catch { menuTable = ''; }
  const ids = which === 'both' ? ['guide', 'workbook'] : [which];
  if (!ids.every(i => BOOKS[i])) throw new Error('--book is guide, workbook or both');
  const counts = {};
  // Pass 1 of each, then pass 2 of each: the second knows where everything landed in both books.
  for (const pass of [1, 2]) {
    for (const id of ids) {
      const htmlPath = join(workDir, `${id}.html`);
      writeFileSync(htmlPath, book(id));
      if (argv.includes('--html-only')) { console.log(htmlPath); continue; }
      const pdf = join(workDir, BOOKS[id].file);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 300_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 600_000 });
      const m = await markersOf(pdf);
      const moved = Object.keys(m.found).filter(k => m.found[k] !== pagesBy[id][k]).length;
      pagesBy[id] = m.found;
      counts[id] = m.count;
      writeFileSync(join(workDir, `pages-${id}.json`), JSON.stringify(m.found, null, 1));
      console.log(`${id} pass ${pass}: ${m.count} pages, ${Object.keys(m.found).length} places${pass === 2 ? `, ${moved} moved since pass 1` : ''}`);
    }
    if (argv.includes('--html-only')) break;
  }
  for (const id of Object.keys(counts)) console.log(`${join(workDir, BOOKS[id].file)} · ${counts[id]} pages`);
} finally {
  await browser.close();
}
