/**
 * How a job's email settings are described, in one place.
 *
 * They were drawn three ways: the jobs panel tinted each chip by outcome severity, so the
 * "fail" chip was red whether or not the alert was switched on -- red on a panel that also
 * shows run status reads as "this job failed", not "you will be emailed if it does". The
 * history panel used green for on, meaning the same red never appeared and the two screens
 * disagreed about what colour meant. Only the edit form said it plainly.
 *
 * So colour here encodes exactly one thing: whether the alert is on. The wording is the edit
 * form's, because that is where someone sets it and the two should match.
 */
export interface NotifyFlags {
  completeJob?: boolean | null;
  failJob?: boolean | null;
  skipJob?: boolean | null;
  assignedUsername?: string | null;
}

export interface NotifyChip {
  /** The event, as the edit form names it. */
  label: string;
  on: boolean;
}

export function notifyChips(job: NotifyFlags): NotifyChip[] {
  return [
    { label: 'completes', on: !!job.completeJob },
    { label: 'fails', on: !!job.failJob },
    { label: 'is skipped', on: !!job.skipJob },
  ];
}

export function notifyCount(job: NotifyFlags): number {
  return notifyChips(job).filter(chip => chip.on).length;
}

/**
 * The setting as a sentence, so it is read rather than decoded -- and naming the recipient,
 * which none of the three chip rows did. Someone reading a panel wants "who gets told, and
 * when", and that was the one thing three chips could not say.
 */
export function notifySentence(job: NotifyFlags): string {
  const on = notifyChips(job).filter(chip => chip.on).map(chip => chip.label);
  const who = job.assignedUsername?.trim() || 'the assigned user';
  if (!on.length) return `No email is sent to ${who} about this job.`;
  return `Emails ${who} when this job ${joinWords(on)}.`;
}

/** "a", "a or b", "a, b or c" -- an Oxford-less list, as the sentence reads aloud. */
function joinWords(words: string[]): string {
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}
