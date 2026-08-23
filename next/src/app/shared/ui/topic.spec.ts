import { describe, it, expect } from 'vitest';
import { parseTopicPartition, formatTopicPartition } from './topic';

describe('parseTopicPartition', () => {
  it('splits a well-formed value', () => {
    expect(parseTopicPartition('topic=orders&partitions=[0,1]'))
      .toEqual({ topic: 'orders', partitions: '0,1' });
  });

  it('reads a wildcard partition list', () => {
    expect(parseTopicPartition('topic=orders&partitions=[*]'))
      .toEqual({ topic: 'orders', partitions: '*' });
  });

  it('keeps digits in the topic name', () => {
    // The type dialog once validated topics against [a-zA-Z-]*, which rejected these.
    expect(parseTopicPartition('topic=orders-v2&partitions=[0]').topic).toBe('orders-v2');
  });

  it('treats a bare value as the topic with every partition', () => {
    expect(parseTopicPartition('legacy-topic')).toEqual({ topic: 'legacy-topic', partitions: '*' });
  });

  it('returns empties for nothing at all', () => {
    for (const value of [undefined, null, '']) {
      expect(parseTopicPartition(value)).toEqual({ topic: '', partitions: '' });
    }
  });

  it('round-trips through format', () => {
    const formatted = formatTopicPartition('orders', '0,1');
    expect(parseTopicPartition(formatted)).toEqual({ topic: 'orders', partitions: '0,1' });
  });

  it('formats an empty partition list as the wildcard', () => {
    expect(formatTopicPartition('orders', '')).toBe('topic=orders&partitions=[*]');
  });
});
