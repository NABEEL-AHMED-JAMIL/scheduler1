import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdown';

/**
 * The parser is the piece most likely to break quietly: bad output still renders, it just
 * renders the wrong thing, and the input comes from a model rather than from us.
 */
describe('parseMarkdown', () => {
  const parse = (source: string) => parseMarkdown(source) as any[];

  it('reads a fenced code block with its language', () => {
    const blocks = parse('before\n\n```sql\nselect 1;\nselect 2;\n```\n\nafter');
    const code = blocks.find(b => b.kind === 'code');
    expect(code).toBeDefined();
    expect(code.lang).toBe('sql');
    expect(code.code).toBe('select 1;\nselect 2;');
    expect(blocks.filter(b => b.kind === 'p')).toHaveLength(2);
  });

  it('closes an unterminated code block rather than dropping the text', () => {
    // A streamed reply can arrive mid-fence; the content must still be shown.
    const blocks = parse('```js\nconst a = 1;');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
    expect(blocks[0].code).toBe('const a = 1;');
  });

  it('does not read formatting markers inside inline code', () => {
    const [block] = parse('use `a ** b` here');
    const codeSpan = block.spans.find((s: any) => s.code);
    expect(codeSpan.text).toBe('a ** b');
    expect(block.spans.some((s: any) => s.bold)).toBe(false);
  });

  it('marks bold, italic and links', () => {
    const [block] = parse('**bold** and *italic* and [docs](https://example.com/x)');
    expect(block.spans.find((s: any) => s.bold).text).toBe('bold');
    expect(block.spans.find((s: any) => s.italic).text).toBe('italic');
    const link = block.spans.find((s: any) => s.href);
    expect(link.text).toBe('docs');
    expect(link.href).toBe('https://example.com/x');
  });

  it('ignores a link whose target is not http', () => {
    // javascript: and data: URLs must never become an anchor href.
    const [block] = parse('[click](javascript:alert(1))');
    expect(block.spans.some((s: any) => s.href)).toBe(false);
  });

  it('groups consecutive bullets into one list', () => {
    const blocks = parse('- one\n- two\n- three');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('ul');
    expect(blocks[0].items).toHaveLength(3);
  });

  it('reads ordered lists separately from bullets', () => {
    const blocks = parse('1. first\n2. second\n\n- bullet');
    expect(blocks.map(b => b.kind)).toEqual(['ol', 'ul']);
    expect(blocks[0].items).toHaveLength(2);
  });

  it('reads headings with their level', () => {
    const blocks = parse('# Title\n\n### Smaller');
    expect(blocks[0].kind).toBe('h');
    expect(blocks[0].level).toBe(1);
    expect(blocks[1].level).toBe(3);
  });

  it('treats a rule as a break, not as paragraph text', () => {
    const blocks = parse('above\n\n---\n\nbelow');
    expect(blocks.map(b => b.kind)).toEqual(['p', 'hr', 'p']);
  });

  it('joins wrapped lines into one paragraph', () => {
    const blocks = parse('a line\nthat wrapped\n\nsecond');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].spans[0].text).toBe('a line that wrapped');
  });

  it('returns nothing for empty input', () => {
    expect(parse('')).toEqual([]);
    expect(parse('   \n  \n')).toEqual([]);
  });
});
