import { describe, it, expect } from 'vitest';
import { capText, limitProblem } from './models-page';

describe('Platform › Models -- capabilities and limits (contract 2026-11-03)', () => {
  it('says a detected capability as Yes or No, or not detected yet', () => {
    expect(capText(true)).toBe('Yes');
    expect(capText(false)).toBe('No');
    expect(capText(null)).toBe('Not detected');
  });

  it('takes a limit as a whole number in bounds, or empty for the default', () => {
    expect(limitProblem('callTimeoutSeconds', '')).toBe('');
    expect(limitProblem('callTimeoutSeconds', '120')).toBe('');
    expect(limitProblem('callTimeoutSeconds', '2')).toContain('from 5 to 900');
    expect(limitProblem('answerTokens', '800.5')).toContain('whole number');
    expect(limitProblem('maxParallel', '4')).toBe('');
    expect(limitProblem('maxParallel', '0')).toContain('from 1 to 64');
  });
});
