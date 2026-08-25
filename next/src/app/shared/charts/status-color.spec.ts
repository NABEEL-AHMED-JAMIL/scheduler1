import { describe, it, expect } from 'vitest';
import { statusColor } from './status-color';

/**
 * One mapping, used everywhere.
 *
 * The Reports screen restated this list rather than calling it, and drew Interrupt in amber
 * while every other chart and pill drew it in soft red. These pin the answers so a second copy
 * would have to disagree with a test before it could disagree with the rest of the console.
 */
describe('status colours', () => {
  it.each([
    ['Completed', 'var(--series-ok)'],
    ['Failed',    'var(--series-crit)'],
    ['Interrupt', 'var(--series-crit-soft)'],
    ['Queue',     'var(--series-muted)'],
    ['Start',     'var(--series-brand-soft)'],
    ['Running',   'var(--series-brand)'],
    ['Skip',      'var(--series-warn-soft)'],
    ['Missed',    'var(--series-warn)'],
  ])('%s is %s', (status, token) => {
    expect(statusColor(status)).toBe(token);
  });

  it('does not care about case, since these arrive from several sources', () => {
    expect(statusColor('completed')).toBe(statusColor('Completed'));
    expect(statusColor('FAILED')).toBe(statusColor('Failed'));
  });

  it('separates the two ends of a family, so Failed and Interrupt are not one colour', () => {
    expect(statusColor('Failed')).not.toBe(statusColor('Interrupt'));
    expect(statusColor('Start')).not.toBe(statusColor('Running'));
    expect(statusColor('Skip')).not.toBe(statusColor('Missed'));
  });

  it('falls back to the categorical palette for a label with no status meaning', () => {
    // A task or an owner has no inherent colour; it takes its place in the series.
    expect(statusColor('Hurricane Data Task', 0)).toBe('var(--chart-0)');
    expect(statusColor('Send Email Batch', 3)).toBe('var(--chart-3)');
  });

  it('wraps the categorical palette rather than running off the end', () => {
    expect(statusColor('anything', 6)).toBe('var(--chart-0)');
    expect(statusColor('anything', 13)).toBe('var(--chart-1)');
  });

  it('treats an absent status as categorical rather than throwing', () => {
    expect(statusColor('')).toBe('var(--chart-0)');
    expect(statusColor(undefined as unknown as string)).toBe('var(--chart-0)');
  });
});
