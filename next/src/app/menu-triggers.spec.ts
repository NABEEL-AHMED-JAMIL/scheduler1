import { describe, it, expect } from 'vitest';

/**
 * Owner 2026-10-27 (invoice INV-2026-10-0003, a workspace admin on a draft): the invoice's ⋯ "More actions" opened an
 * empty menu -- every item behind a condition that was false. The rule for every menu in the console: a menu whose items
 * are all conditional (none outside an @if, @for or @switch) has its trigger directly inside an @if / @else block that
 * says whether there is anything to show (hasActions(), list.length, ...) -- so a trigger with no items is never shown.
 * Scanned like code-standard.spec.ts: every template under src/app.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface Template { path: string; text: string; offset: number }

async function templates(): Promise<Template[]> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const out: Template[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
        const text = fs.readFileSync(path, 'utf8');
        if (!text.includes('cdkMenuTriggerFor')) continue;
        const rel = path.slice(root.length + 1);
        if (entry.name.endsWith('.html')) out.push({ path: rel, text, offset: 0 });
        else for (const m of text.matchAll(/template:\s*`([\s\S]*?)`/g)) out.push({ path: rel, text: m[1], offset: m.index! });
      }
    }
  };
  walk(`${root}/src/app`);
  return out;
}

/** Interpolations and comments blanked out (same length), so their braces and words do not count. */
const blank = (t: string) => t.replace(/\{\{[\s\S]*?\}\}|<!--[\s\S]*?-->/g, s => ' '.repeat(s.length));

const BLOCK = /@(?:if|else if|else|for|switch|case|default|empty|defer)\b[^{]*\{|\}/g;

/** The control-flow blocks open at a position: each one's kind and where its body starts. */
function openBlocks(t: string, at: number): { kind: string; body: number }[] {
  const stack: { kind: string; body: number }[] = [];
  for (const m of t.slice(0, at).matchAll(BLOCK)) {
    if (m[0] === '}') stack.pop();
    else stack.push({ kind: /@(else if|else|if|for|switch|case|default|empty|defer)/.exec(m[0])![1], body: m.index! + m[0].length });
  }
  return stack;
}

/** Whether a menu's body has an item outside any control-flow block. */
function hasUnconditionalItem(body: string): boolean {
  let depth = 0;
  for (const m of body.matchAll(/@(?:if|else if|else|for|switch|case|default|empty|defer)\b[^{]*\{|\}|cdkMenuItem\b/g)) {
    if (m[0] === '}') depth = Math.max(0, depth - 1);
    else if (m[0].startsWith('@')) depth++;
    else if (depth === 0) return true;
  }
  return false;
}

/** Every trigger of a menu whose items are all conditional and that is not guarded: "path:line #menu". */
export function unguardedTriggers(list: { path: string; text: string; offset?: number }[]): string[] {
  const found: string[] = [];
  for (const { path, text } of list) {
    const t = blank(text);
    for (const m of t.matchAll(/\[cdkMenuTriggerFor\]="(\w+)"/g)) {
      const open = new RegExp(`<ng-template\\s+#${m[1]}\\b[^>]*>`).exec(t);
      if (!open) continue;
      const body = t.slice(open.index + open[0].length, t.indexOf('</ng-template>', open.index));
      if (!body.includes('cdkMenuItem') || hasUnconditionalItem(body)) continue;
      const tagStart = t.lastIndexOf('<', m.index!);
      const block = openBlocks(t, tagStart).pop();
      const between = block ? t.slice(block.body, tagStart).replace(/<ng-template[\s\S]*?<\/ng-template>/g, '').trim() : 'none';
      const guarded = !!block && ['if', 'else if', 'else'].includes(block.kind) && between === '';
      if (!guarded) found.push(`${path}:${text.slice(0, m.index!).split('\n').length} #${m[1]}`);
    }
  }
  return found;
}

describe('A ⋯ menu with nothing to show is not shown', () => {
  it('guards the trigger of every menu whose items are all conditional', async () => {
    expect(unguardedTriggers(await templates())).toEqual([]);
  });

  it('tells a guarded trigger from one that can open an empty menu', () => {
    const menu = '<ng-template #m><div cdkMenu>@if (a()) { <button cdkMenuItem>A</button> }</div></ng-template>';
    expect(unguardedTriggers([{ path: 'x.html', text: `<div><button [cdkMenuTriggerFor]="m">⋯</button>${menu}</div>` }])).toEqual(['x.html:1 #m']);
    expect(unguardedTriggers([{ path: 'x.html', text: `@if (hasActions()) { <button [cdkMenuTriggerFor]="m">⋯</button> }${menu}` }])).toEqual([]);
    // Inside a loop is not a guard; an item outside any condition needs none.
    expect(unguardedTriggers([{ path: 'x.html', text: `@for (r of rows; track r) { <button [cdkMenuTriggerFor]="m">⋯</button> }${menu}` }]))
      .toEqual(['x.html:1 #m']);
    expect(unguardedTriggers([{ path: 'x.html', text: '<button [cdkMenuTriggerFor]="n">⋯</button><ng-template #n><div cdkMenu>'
      + '<button cdkMenuItem>Always</button></div></ng-template>' }])).toEqual([]);
  });
});
