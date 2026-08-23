import { describe, it, expect } from 'vitest';
import { parseDownloadableFiles, stripExportFences, EXPORT_MIME } from './chat-export';

const fence = (lang: string, body: string, target?: string) =>
  '```' + lang + '\n' + body + '\n```' + (target ? `\nTARGET_FORMAT: ${target}` : '');

describe('parseDownloadableFiles', () => {
  it('pulls a plain fence out as a file', () => {
    const [file] = parseDownloadableFiles(fence('csv', 'a,b\n1,2'), 'report');
    expect(file.filename).toBe('report-export.csv');
    expect(file.content).toBe('a,b\n1,2');
    expect(file.mimeType).toBe(EXPORT_MIME['csv']);
    expect(file.pendingExport).toBeUndefined();
  });

  it('marks a TARGET_FORMAT fence for server conversion', () => {
    const [file] = parseDownloadableFiles(fence('csv', 'a,b\n1,2', 'xlsx'), 'report');
    expect(file.filename).toBe('report-export.xlsx');
    expect(file.pendingExport).toEqual({
      sourceFormat: 'csv', targetFormat: 'xlsx',
      filename: 'report-export.xlsx', mimeType: EXPORT_MIME['xlsx'],
    });
    // the content stays the source text -- the server does the conversion
    expect(file.content).toBe('a,b\n1,2');
  });

  it('treats a fence tagged with a binary format as text to convert', () => {
    const [file] = parseDownloadableFiles(fence('pdf', 'Hello'), 'doc');
    expect(file.pendingExport?.sourceFormat).toBe('txt');
    expect(file.pendingExport?.targetFormat).toBe('pdf');
  });

  it('ignores a TARGET_FORMAT the server cannot produce', () => {
    // a model writing "TARGET_FORMAT: html" over an ```html fence is noise, not a request
    const [file] = parseDownloadableFiles(fence('html', '<p>hi</p>', 'html'), 'page');
    expect(file.pendingExport).toBeUndefined();
    expect(file.filename).toBe('page-export.html');
  });

  it('numbers files after the first', () => {
    const files = parseDownloadableFiles(fence('csv', 'a') + '\n\n' + fence('json', '{}'), 'x');
    expect(files.map(f => f.filename)).toEqual(['x-export.csv', 'x-export-2.json']);
  });

  it('normalises the markdown alias', () => {
    expect(parseDownloadableFiles(fence('markdown', '# hi'), 'n')[0].filename).toBe('n-export.md');
  });

  it('drops instruction text the model echoed into the fence', () => {
    const body = 'a,b\n1,2\n--- END FILE CONTENT ---\nTARGET_FORMAT: xlsx';
    expect(parseDownloadableFiles(fence('csv', body), 'r')[0].content).toBe('a,b\n1,2');
  });

  it('skips an empty fence', () => {
    expect(parseDownloadableFiles(fence('csv', '   '), 'r')).toEqual([]);
  });

  it('returns nothing for a reply with no fence', () => {
    expect(parseDownloadableFiles('Just a normal answer.', 'r')).toEqual([]);
    expect(parseDownloadableFiles('', 'r')).toEqual([]);
  });

  it('leaves a fence in an unsupported language alone', () => {
    expect(parseDownloadableFiles('```python\nprint(1)\n```', 'r')).toEqual([]);
  });
});

describe('stripExportFences', () => {
  it('removes the fence so it does not render twice', () => {
    const reply = 'Here is your data:\n\n' + fence('csv', 'a,b') + '\n\nLet me know.';
    const shown = stripExportFences(reply);
    expect(shown).not.toContain('```');
    expect(shown).not.toContain('a,b');
    expect(shown).toContain('Here is your data:');
    expect(shown).toContain('Let me know.');
  });

  it('removes the trailing TARGET_FORMAT line with the fence', () => {
    expect(stripExportFences(fence('csv', 'a', 'xlsx'))).toBe('');
  });

  it('leaves an ordinary code block untouched', () => {
    const reply = '```python\nprint(1)\n```';
    expect(stripExportFences(reply)).toBe(reply);
  });
});
