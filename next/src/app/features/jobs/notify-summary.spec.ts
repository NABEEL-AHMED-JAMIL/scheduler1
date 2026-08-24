import { describe, it, expect } from 'vitest';
import { notifyChips, notifyCount, notifySentence } from './notify-summary';

const WHO = 'admin@platform.local';

describe('notification chips', () => {
  it('always offers all three, so what is off is visible too', () => {
    expect(notifyChips({}).map(c => c.label)).toEqual(['completes', 'fails', 'is skipped']);
  });

  it('uses the wording the edit form uses', () => {
    // The form says "A run is skipped"; a chip reading bare "skip" looked like a run status.
    expect(notifyChips({}).map(c => c.label)).toContain('is skipped');
  });

  it('treats a missing flag as off rather than crashing', () => {
    expect(notifyChips({ failJob: null }).every(c => !c.on)).toBe(true);
    expect(notifyCount({})).toBe(0);
  });

  it('counts only what is on', () => {
    expect(notifyCount({ completeJob: true, skipJob: true })).toBe(2);
  });
});

describe('notification sentence', () => {
  it('names the recipient, which the chips never did', () => {
    const text = notifySentence({ failJob: true, assignedUsername: WHO });
    expect(text).toBe(`Emails ${WHO} when this job fails.`);
  });

  it('says plainly when nothing is sent', () => {
    expect(notifySentence({ assignedUsername: WHO }))
      .toBe(`No email is sent to ${WHO} about this job.`);
  });

  it('joins two events with or', () => {
    expect(notifySentence({ completeJob: true, failJob: true, assignedUsername: WHO }))
      .toBe(`Emails ${WHO} when this job completes or fails.`);
  });

  it('joins three as a list', () => {
    expect(notifySentence({ completeJob: true, failJob: true, skipJob: true, assignedUsername: WHO }))
      .toBe(`Emails ${WHO} when this job completes, fails or is skipped.`);
  });

  it('falls back when no one is assigned, rather than saying "Emails  when"', () => {
    expect(notifySentence({ failJob: true })).toBe('Emails the assigned user when this job fails.');
    expect(notifySentence({ failJob: true, assignedUsername: '   ' }))
      .toBe('Emails the assigned user when this job fails.');
  });
});
