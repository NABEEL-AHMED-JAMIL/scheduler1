import { describe, it, expect } from 'vitest';
import { testMessageText } from './kafka-text';

describe('UI review U6: a Kafka test answer without the cluster id', () => {
  it('drops the internal cluster id and counts brokers in words', () => {
    expect(testMessageText('Connected successfully — cluster "0Ybm6iBNTDu4CewhIacjkA" with 1 broker(s).'))
      .toBe('Connected successfully — 1 broker answered.');
    expect(testMessageText('Connected successfully — cluster "abc" with 3 broker(s).')).toBe('Connected successfully — 3 brokers answered.');
    expect(testMessageText('Timed out after 10 s.')).toBe('Timed out after 10 s.');
    expect(testMessageText(null)).toBe('');
  });
});
