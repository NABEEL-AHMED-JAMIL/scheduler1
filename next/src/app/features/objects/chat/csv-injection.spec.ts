import { describe, it, expect } from 'vitest';
import { parseDownloadableFiles } from './chat-export';

/**
 * A csv fence becomes a file the reader opens in Excel, and its content came from a model
 * summarising documents out of a bucket. Neither link in that chain is ours to trust with the
 * first character of a cell.
 */
describe('csv fences are not spreadsheet formulas', () => {
  it.each(['=1+1', '@SUM(A1)', '=HYPERLINK("http://evil","click")', '=cmd|calc'])(
    'defuses %s', payload => {
      const [file] = parseDownloadableFiles('```csv\nname,value\nrow,' + payload + '\n```');
      expect(file.content).not.toMatch(new RegExp(',\\' + payload[0]));
    });

  it('leaves a genuine negative number alone', () => {
    const [file] = parseDownloadableFiles('```csv\nname,value\nrow,-5\n```');
    expect(file.content).toContain(',-5');
  });

  it('leaves ordinary text alone', () => {
    const [file] = parseDownloadableFiles('```csv\na,b\nhello,world\n```');
    expect(file.content).toBe('a,b\nhello,world');
  });
});
