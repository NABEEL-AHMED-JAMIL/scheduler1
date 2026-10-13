import { describe, it, expect } from 'vitest';
import { readableRunError } from './run-error';

/** UX final MC1: Recent runs printed `HTTP 400: {"error":"{\"error\":…` and cut it; now a sentence, the raw text kept. */
describe('readableRunError', () => {
  it('peels a status and nested JSON down to the provider\'s message', () => {
    const raw = 'HTTP 400: {"error":"{\\"error\\":\\"model \'llava:13b\' not found, try pulling it first\\"}"}';
    expect(readableRunError(raw)).toEqual({ text: 'Model \'llava:13b\' not found, try pulling it first (HTTP 400).', raw });
  });

  it('reads an OpenAI-style error object and a plain message body', () => {
    expect(readableRunError('HTTP 401: {"error":{"message":"Incorrect API key provided","type":"invalid_request_error"}}')!.text)
      .toBe('Incorrect API key provided (HTTP 401).');
    expect(readableRunError('HTTP 503: upstream connect error')!.text).toBe('Upstream connect error (HTTP 503).');
  });

  it('salvages the message from JSON cut short, and falls back to what the status means', () => {
    expect(readableRunError('HTTP 400: {"error":"{\\"error\\":\\"model \'x\' not fo')!.text).toBe('Model \'x\' not fo (HTTP 400).');
    expect(readableRunError('HTTP 429: {"code":42}')!.text).toBe('The provider is limiting requests: too many, or the quota is used up (HTTP 429).');
    expect(readableRunError('HTTP 418:')!.text).toBe('The provider refused the request (HTTP 418).');
  });

  it('says a one-word reason in words, and keeps no raw copy of text that is already plain', () => {
    expect(readableRunError('timeout')).toEqual({ text: 'The model did not answer in time.', raw: 'timeout' });
    expect(readableRunError('Connection refused')).toEqual({ text: 'Connection refused.', raw: null });
    expect(readableRunError('')).toBeNull();
    expect(readableRunError(null)).toBeNull();
  });
});
