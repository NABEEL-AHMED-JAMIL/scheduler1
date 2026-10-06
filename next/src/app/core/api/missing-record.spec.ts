import { describe, it, expect } from 'vitest';
import { isMissingRecord, isRecordId } from './missing-record';

describe('isRecordId', () => {
  it('takes whole numbers only', () => {
    expect(isRecordId('7714')).toBe(true);
    expect(isRecordId(' 12 ')).toBe(true);
    expect(isRecordId('abc')).toBe(false);
    expect(isRecordId('12a')).toBe(false);
    expect(isRecordId('')).toBe(false);
    expect(isRecordId(null)).toBe(false);
  });
});

/**
 * The server answers an id it has no record of with 200, status ERROR and a sentence such as
 * "SourceTask not found with 999999." -- the same shape as a real refusal, so it is told apart by
 * its words. A 400 or 404 says the same.
 */
describe('isMissingRecord', () => {
  it('knows the server\'s not-found sentences', () => {
    expect(isMissingRecord({ status: 'ERROR', message: 'SourceTask not found with 999999.' })).toBe(true);
    expect(isMissingRecord({ status: 'ERROR', message: 'SourceJob not found with jobId.' })).toBe(true);
    expect(isMissingRecord({ status: 'ERROR', message: 'Job id abc is not valid.' })).toBe(true);
  });

  it('knows a 400 or 404', () => {
    expect(isMissingRecord({ status: 404, error: {} })).toBe(true);
    expect(isMissingRecord({ status: 400, error: { message: 'Bad' } })).toBe(true);
  });

  it('leaves other failures alone, so they keep Try again', () => {
    expect(isMissingRecord({ status: 'ERROR', message: 'The database is busy.' })).toBe(false);
    expect(isMissingRecord({ status: 500, error: { message: 'Internal Server Error' } })).toBe(false);
    expect(isMissingRecord({ status: 0, error: {} })).toBe(false);
    expect(isMissingRecord(null)).toBe(false);
  });
});
