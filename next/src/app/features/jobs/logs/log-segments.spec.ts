import { describe, it, expect } from 'vitest';
import { logSegments, pathParts } from './log-segments';

/**
 * MIG-212: a log line names the files a run read and wrote. They were plain text, broken
 * mid-name at the edge of the column ("orders_2026-09-" / "a.csv"), and a click did nothing.
 * A path is now its own segment, linked to its folder in the Object Browser.
 */
describe('logSegments', () => {
  it('splits a line into its text and the paths it names, linked to their folders', () => {
    const line = 'sales/in/orders_2026-09-a.csv -> e2e/verify/json/orders_2026-09-a.json :: 60 row(s), 7 column(s)';
    expect(logSegments(line, 'etl-bucket')).toEqual([
      { text: 'sales/in/orders_2026-09-a.csv', path: { bucket: 'etl-bucket', prefix: 'sales/in/' } },
      { text: ' -> ' },
      { text: 'e2e/verify/json/orders_2026-09-a.json', path: { bucket: 'etl-bucket', prefix: 'e2e/verify/json/' } },
      { text: ' :: 60 row(s), 7 column(s)' },
    ]);
  });

  it('reads a path that starts with the task\'s bucket as that bucket\'s folder', () => {
    expect(logSegments('Scanning etl-bucket/sales/in :: found 2 CSV object(s)', 'etl-bucket')).toEqual([
      { text: 'Scanning ' },
      { text: 'etl-bucket/sales/in', path: { bucket: 'etl-bucket', prefix: 'sales/in/' } },
      { text: ' :: found 2 CSV object(s)' },
    ]);
  });

  it('leaves the full stop that ends a sentence out of the path', () => {
    expect(logSegments('AI step <analysis>: 2 object(s) under sales/in/.', 'etl-bucket')).toEqual([
      { text: 'AI step <analysis>: 2 object(s) under ' },
      { text: 'sales/in/', path: { bucket: 'etl-bucket', prefix: 'sales/in/' } },
      { text: '.' },
    ]);
  });

  it('marks a path without a link when the run names no bucket', () => {
    expect(logSegments('wrote out/a.csv', null)).toEqual([{ text: 'wrote ' }, { text: 'out/a.csv', path: { bucket: null, prefix: 'out/' } }]);
  });

  it('is not fooled by a URL, a ratio or a date', () => {
    for (const text of ['see https://example.com/a/b for more', 'done 3/4 steps', 'ran on 2026/09/20', 'Job 2808 now in the queue.']) {
      expect(logSegments(text, 'etl-bucket')).toEqual([{ text }]);
    }
  });

  it('breaks a long path only after a slash', () => {
    expect(pathParts('e2e/verify/json/orders.json')).toEqual(['e2e/', 'verify/', 'json/', 'orders.json']);
    expect(pathParts('sales/in/')).toEqual(['sales/', 'in/']);
  });
});
