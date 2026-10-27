#!/usr/bin/env node
// The help centre's content, from help/ (owner 2026-10-26: one source for the help centre and the client book).
//
//   node scripts/build-help.mjs            # checks help/ and writes public/help/content.json (the help page fetches it)
//   node scripts/build-help.mjs --check    # checks only; exits 1 on any problem
//
// Reads help/<topic>/_topic.md (a topic = a chapter of the book), the topic's articles help/<topic>/NN-*.md in file-name
// order, help/whats-new.md and the screenshots' sizes in public/help/img/figures.json (scripts/help-screenshots.mjs
// writes it). The format is help/README.md. Each article's Markdown is kept as it is: the help page parses it with
// src/app/features/docs/help-markdown.ts, and so does this script (Node strips the types), so the checks here -- every
// link to an article or a part that exists, every figure taken, every section named by its topic -- are made on exactly
// what the page draws. help-content.spec.ts fails when the JSON is older than the Markdown.
//
// Needs a Node that strips TypeScript types (22.18+ or 23.6+).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning');
process.on('warning', w => { if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON') process.stderr.write(`${w.name}: ${w.message}\n`); });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const helpDir = join(root, 'help');
const out = join(root, 'public/help/content.json');
const checkOnly = process.argv.includes('--check');
const { parseHelp, refsOf, parseSpans, linesOf } = await import('../src/app/features/docs/help-markdown.ts');

const problems = [];
const warnings = [];
const sources = {};
const read = path => {
  const text = readFileSync(path, 'utf8');
  sources[relative(root, path)] = createHash('sha256').update(text).digest('hex');
  return text;
};

/** `---` front matter of `key: value` lines, and the body after it. */
function frontMatter(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) { problems.push(`${file}: no front matter`); return { meta: {}, body: text }; }
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { problems.push(`${file}: front matter line "${line}" is not key: value`); continue; }
    // A value may be quoted, as YAML would have it ("Step 1: read"); the quotes are not part of it.
    const v = kv[2].trim();
    meta[kv[1]] = /^(["']).*\1$/.test(v) ? v.slice(1, -1).replace(/\\"/g, '"') : v;
  }
  return { meta, body: m[2] };
}

const list = (v, sep = ',') => (v ? v.split(sep).map(s => s.trim()).filter(Boolean) : []);
/** `Label (/path); Label (/path)`. */
function places(v, file) {
  return list(v, ';').map(p => {
    const m = /^(.*?)\s*\((\/[^)\s]*)\)$/.exec(p);
    if (!m) { problems.push(`${file}: where "${p}" is not "Label (/path)"`); return null; }
    return { label: m[1], path: m[2] };
  }).filter(Boolean);
}

/** A topic's own page: its summary, Start here, Questions and Related (help/README.md). */
function topicBody(body, file) {
  const parts = body.split(/^## /m);
  const summary = parts.shift().trim();
  const topic = { summary, start: [], faq: [], related: [] };
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const title = part.slice(0, nl < 0 ? undefined : nl).trim();
    const text = nl < 0 ? '' : part.slice(nl + 1);
    if (title === 'Start here') {
      for (const line of text.split('\n')) {
        const m = /^\d+\.\s+\[([^\]]+)\]\(#([\w-]+)\)\s*(?:[—–-]\s*)?(.*?)\s*(?:!\[\]\(([\w-]+)\))?\s*$/.exec(line);
        if (m) topic.start.push({ title: m[1], article: m[2], text: m[3], figure: m[4] ?? null });
        else if (line.trim()) problems.push(`${file}: Start here line "${line}" is not "1. [Title](#article) — text ![](figure)"`);
      }
    } else if (title === 'Questions') {
      for (const q of text.split(/^### /m).slice(1)) {
        const qnl = q.indexOf('\n');
        topic.faq.push({ q: q.slice(0, qnl).trim(), md: q.slice(qnl + 1).trim() });
      }
    } else if (title === 'Related') {
      for (const line of text.split('\n')) {
        const m = /^[-*]\s+([\w-]+)\s*$/.exec(line);
        if (m) topic.related.push(m[1]);
        else if (line.trim()) problems.push(`${file}: Related line "${line}" is not "- topic-id"`);
      }
    } else problems.push(`${file}: unknown part "## ${title}" (Start here, Questions or Related)`);
  }
  return topic;
}

const figuresFile = join(root, 'public/help/img/figures.json');
const figureMeta = existsSync(figuresFile) ? JSON.parse(readFileSync(figuresFile, 'utf8')) : {};
const figures = Object.fromEntries(Object.entries(figureMeta)
  .filter(([name]) => existsSync(join(root, 'public/help/img', `${name}.webp`)))
  .map(([name, f]) => [name, [Math.round(f.width / (f.scale || 2)), Math.round(f.height / (f.scale || 2))]]));

const topics = [];
const articles = [];
for (const dir of readdirSync(helpDir).filter(d => statSync(join(helpDir, d)).isDirectory()).sort()) {
  const topicFile = join(helpDir, dir, '_topic.md');
  if (!existsSync(topicFile)) { problems.push(`help/${dir}: no _topic.md`); continue; }
  const { meta, body } = frontMatter(read(topicFile), `help/${dir}/_topic.md`);
  for (const k of ['title', 'chapter', 'part', 'icon', 'blurb', 'sections']) if (!meta[k]) problems.push(`help/${dir}/_topic.md: no ${k}`);
  const topic = { id: dir, title: meta.title, chapter: Number(meta.chapter), part: meta.part, icon: meta.icon, blurb: meta.blurb,
    paths: list(meta.paths), sections: list(meta.sections, '|'), ...topicBody(body, `help/${dir}/_topic.md`), articles: [] };
  for (const f of readdirSync(join(helpDir, dir)).filter(f => /^\d+-.*\.md$/.test(f)).sort()) {
    const file = `help/${dir}/${f}`;
    const { meta: a, body: md } = frontMatter(read(join(helpDir, dir, f)), file);
    for (const k of ['id', 'title', 'summary', 'section']) if (!a[k]) problems.push(`${file}: no ${k}`);
    if (a.section && !topic.sections.includes(a.section)) problems.push(`${file}: section "${a.section}" is not one of ${dir}'s (${topic.sections.join(' | ')})`);
    if (/\n# /.test('\n' + md)) problems.push(`${file}: a # heading; the title is the front matter's, parts start at ##`);
    const words = md.split(/\s+/).filter(Boolean).length;
    articles.push({ id: a.id, topic: dir, section: a.section, title: a.title, summary: a.summary,
      ...(a.who ? { who: a.who } : {}), ...(a.where ? { where: places(a.where, file) } : {}),
      ...(a.aliases ? { aliases: list(a.aliases) } : {}), ...(a.popular ? { popular: a.popular } : {}),
      ...(a.related ? { related: list(a.related) } : {}), minutes: Math.max(1, Math.round(words / 200)), md, file });
    topic.articles.push(a.id);
  }
  topics.push(topic);
}
topics.sort((x, y) => x.chapter - y.chapter);

// Ids: unique, and an alias never shadows an article.
const byId = new Map();
for (const a of articles) {
  if (byId.has(a.id)) problems.push(`${a.file}: id ${a.id} is also ${byId.get(a.id).file}'s`);
  byId.set(a.id, a);
}
const aliases = new Map();
for (const a of articles) for (const al of a.aliases ?? []) {
  if (byId.has(al) || aliases.has(al)) problems.push(`${a.file}: alias ${al} is taken`);
  aliases.set(al, a.id);
}
const partIds = new Map(articles.map(a => [a.id, new Set(parseHelp(a.md, a.id).filter(b => b.kind === 'h').map(b => b.id))]));
const resolves = ref => {
  const [art] = ref.split('--');
  const id = byId.has(art) ? art : aliases.get(art);
  if (!id) return false;
  return ref === art || partIds.get(id).has(`${id}--${ref.slice(art.length + 2)}`);
};
const missingFigures = new Set();
const checkMd = (md, where, prefix = '') => {
  const refs = refsOf(parseHelp(md, prefix));
  for (const r of refs.articles) if (!resolves(r)) problems.push(`${where}: link #${r} goes to no article or part`);
  for (const f of refs.figures) if (!figures[f]) missingFigures.add(`${f} (${where})`);
};
for (const a of articles) {
  checkMd(a.md, a.file, a.id);
  for (const r of a.related ?? []) if (!byId.has(r)) problems.push(`${a.file}: related ${r} is no article`);
}
const topicIds = new Set(topics.map(t => t.id));
for (const t of topics) {
  const file = `help/${t.id}/_topic.md`;
  checkMd(t.summary, file);
  for (const s of t.start) {
    if (!byId.has(s.article)) problems.push(`${file}: Start here links #${s.article}, no article`);
    if (s.figure && !figures[s.figure]) missingFigures.add(`${s.figure} (${file})`);
    for (const p of parseSpans(s.text)) if (p.article && !resolves(p.article)) problems.push(`${file}: link #${p.article} goes nowhere`);
  }
  for (const q of t.faq) checkMd(q.md, `${file} "${q.q}"`);
  for (const r of t.related) if (!topicIds.has(r)) problems.push(`${file}: related topic ${r} does not exist`);
  for (const sec of t.sections) if (!articles.some(a => a.topic === t.id && a.section === sec)) warnings.push(`${file}: section "${sec}" has no article yet`);
}

// What's new: "- 2026-10-26 · [Title](#article) · text".
const whatsNew = [];
const newsFile = join(helpDir, 'whats-new.md');
if (existsSync(newsFile)) {
  for (const line of read(newsFile).split('\n')) {
    const m = /^[-*]\s+(\d{4}-\d{2}-\d{2})\s+·\s+\[([^\]]+)\]\(#([\w-]+)\)\s+·\s+(.+)$/.exec(line);
    if (m) {
      if (!resolves(m[3])) problems.push(`help/whats-new.md: #${m[3]} goes nowhere`);
      whatsNew.push({ date: m[1], title: m[2], article: m[3], text: m[4].trim() });
    } else if (line.startsWith('-')) problems.push(`help/whats-new.md: "${line}" is not "- date · [Title](#article) · text"`);
  }
}

for (const f of [...missingFigures].sort()) warnings.push(`figure not taken yet: ${f}`);
if (process.argv.includes('--verbose')) for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
else if (warnings.length) process.stderr.write(`${warnings.length} warning(s): empty sections or figures not taken yet (--verbose lists them)\n`);
if (problems.length) {
  for (const p of problems) process.stderr.write(`problem: ${p}\n`);
  process.stderr.write(`${problems.length} problem(s); nothing written.\n`);
  process.exit(1);
}

const words = articles.reduce((n, a) => n + linesOf(parseHelp(a.md)).reduce((m, l) => m + l.text.split(/\s+/).length, 0), 0);
const content = {
  note: 'Made by scripts/build-help.mjs from help/: edit the Markdown, then run it.',
  sources: Object.fromEntries(Object.entries(sources).sort()),
  topics, articles: articles.map(({ file, ...a }) => a), whatsNew, figures,
};
if (!checkOnly) writeFileSync(out, JSON.stringify(content, null, 1) + '\n');
console.log(`${topics.length} topics, ${articles.length} articles, about ${words} words, ${Object.keys(figures).length} figures`
  + `${missingFigures.size ? `, ${missingFigures.size} figure(s) still to take` : ''}${checkOnly ? ' (checked)' : ` -> ${relative(root, out)}`}`);
for (const t of topics) console.log(`  ${String(t.chapter).padStart(2)} ${t.id}: ${t.articles.length}`);
