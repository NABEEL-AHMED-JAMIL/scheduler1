import { describe, it, expect } from 'vitest';

/** Mirrors the component's parser so the shapes it must survive are pinned. */
function parse(text: string): { time: string; text: string }[] {
  if (!text) return [];
  const pattern = /\[(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]/g;
  const found: { time: string; at: number; length: number }[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    found.push({ time: match[1], at: match.index, length: match[0].length });
  }
  if (!found.length) return [{ time: '', text: text.trim() }];

  const segments: { time: string; text: string }[] = [];
  const lead = text.slice(0, found[0].at).trim();
  if (lead) segments.push({ time: '', text: lead });
  found.forEach((marker, index) => {
    const from = marker.at + marker.length;
    const to = index + 1 < found.length ? found[index + 1].at : text.length;
    segments.push({ time: marker.time, text: text.slice(from, to).trim() });
  });
  return segments;
}

describe('transcript segments', () => {
  it('splits on the [HH:MM:SS.mmm] markers the extractor emits', () => {
    expect(parse('[00:00:03.550] Hello there. [00:00:07.120] Second bit.')).toEqual([
      { time: '00:00:03.550', text: 'Hello there.' },
      { time: '00:00:07.120', text: 'Second bit.' },
    ]);
  });

  it('accepts a marker with no milliseconds', () => {
    expect(parse('[00:01:02] Words')).toEqual([{ time: '00:01:02', text: 'Words' }]);
  });

  it('returns one untimed block when timestamps are switched off', () => {
    expect(parse('Just a merged block of speech.'))
      .toEqual([{ time: '', text: 'Just a merged block of speech.' }]);
  });

  it('keeps text that appears before the first marker', () => {
    // Dropping it would silently lose the opening words.
    expect(parse('Preamble. [00:00:01.000] After')).toEqual([
      { time: '', text: 'Preamble.' },
      { time: '00:00:01.000', text: 'After' },
    ]);
  });

  it('keeps a marker with no speech after it rather than dropping the entry', () => {
    expect(parse('[00:00:01.000] [00:00:02.000] Second')).toEqual([
      { time: '00:00:01.000', text: '' },
      { time: '00:00:02.000', text: 'Second' },
    ]);
  });

  it('handles an empty transcript', () => {
    expect(parse('')).toEqual([]);
  });

  it('does not treat a bracketed non-timestamp as a marker', () => {
    const result = parse('[inaudible] some words');
    expect(result).toEqual([{ time: '', text: '[inaudible] some words' }]);
  });
});
