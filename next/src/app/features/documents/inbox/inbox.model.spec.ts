import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_KINDS, InboxFile, InboxSettings, capProblem, capSentence, inboxOf, filesOf, megabytes, oversizeReason, shortSha,
  uploaderName,
} from './inbox.model';

/**
 * MIG-239 console: the inbox's settings and arrivals as storage-service answers them, and the sentences the page
 * builds from them. The service decides every refusal; the page only words the limits and names who uploaded.
 */
const SETTINGS: InboxSettings = {
  configured: true, alias: 'ui-review-s3', connectionName: 'UI-REVIEW LocalStack S3 (fake keys)', connectionActive: true,
  maxBytes: 104857600, platformMaxBytes: 104857600,
};

describe('inbox settings', () => {
  it('reads the settings, and treats anything else as not configured', () => {
    expect(inboxOf(SETTINGS)?.alias).toBe('ui-review-s3');
    expect(inboxOf(null)).toBeNull();
    expect(inboxOf([])).toBeNull();
    expect(inboxOf('nope')).toBeNull();
  });

  it('words the limit, and says when the workspace set a lower one', () => {
    expect(capSentence(SETTINGS)).toBe('Up to 100 MB a file.');
    expect(capSentence({ ...SETTINGS, maxBytes: 5 * 1048576, workspaceMaxBytes: 5 * 1048576 }))
      .toBe('Up to 5 MB a file (a workspace limit; the platform allows 100 MB).');
  });

  it('lists every kind the service accepts, grouped, with no executable among them', () => {
    const all = ACCEPTED_KINDS.flatMap(k => k.extensions);
    expect(all).toContain('.csv');
    expect(all).toContain('.pdf');
    expect(all).toContain('.parquet');
    expect(all.some(e => ['.exe', '.sh', '.bat', '.js', '.msi'].includes(e))).toBe(false);
    expect(new Set(all).size).toBe(all.length);
  });

  it('turns megabytes into bytes, and back', () => {
    expect(megabytes(104857600)).toBe(100);
    expect(megabytes(null)).toBeNull();
  });

  it('checks a lower cap before the round trip: a whole number of MB, above zero, within the platform\'s', () => {
    expect(capProblem('', 104857600)).toBe('');
    expect(capProblem('25', 104857600)).toBe('');
    expect(capProblem('0', 104857600)).toBe('Enter a limit above 0 MB, or leave it empty for the platform\'s.');
    expect(capProblem('2.5', 104857600)).toBe('Enter a whole number of MB.');
    expect(capProblem('abc', 104857600)).toBe('Enter a whole number of MB.');
    expect(capProblem('101', 104857600)).toBe('The platform allows at most 100 MB a file.');
  });
});

describe('an upload that cannot fit', () => {
  it('is refused before it is sent, in the service\'s words for the limit', () => {
    expect(oversizeReason('big.csv', 200 * 1048576, 104857600))
      .toBe('\'big.csv\' is 200 MB; the inbox takes files up to 100 MB.');
    expect(oversizeReason('small.csv', 10, 104857600)).toBe('');
  });
});

describe('the arrivals', () => {
  const FILE: InboxFile = {
    arrivalId: '778ed857-81ce-4915-821d-ea25b22ba764', alias: 'ui-review-s3',
    key: 'intake/2026/09/28/778ed857-81ce-4915-821d-ea25b22ba764-live-customers.csv', fileName: 'live-customers.csv',
    bytes: 115, contentType: 'text/csv', sha256: '4e847b8e719b2acad7fdd61ccb4f9328d3c305e9f9b09c30b0915fdb2602c6a5',
    uploadedBy: 4537, uploadedAt: '2026-09-28T23:41:23.054311',
  };

  it('keeps only rows that are arrivals', () => {
    expect(filesOf([FILE, null, { nope: 1 }, 'x'])).toEqual([FILE]);
    expect(filesOf({})).toEqual([]);
  });

  it('shortens a checksum to its first twelve characters', () => {
    expect(shortSha(FILE.sha256)).toBe('4e847b8e719b');
    expect(shortSha(null)).toBe('—');
  });

  it('names who uploaded: you, a member by name when the directory is readable, else the user number', () => {
    const names = new Map([[4597, 'Alex']]);
    expect(uploaderName(4537, 4537, names)).toBe('You');
    expect(uploaderName(4597, 4537, names)).toBe('Alex');
    expect(uploaderName(4600, 4537, names)).toBe('User 4600');
    expect(uploaderName(null, 4537, names)).toBe('—');
  });
});
