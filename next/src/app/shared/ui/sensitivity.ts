import { Component, computed, input } from '@angular/core';

/**
 * The three levels a workspace's data policy knows (MIG-243): public, internal and sensitive. A prompt declares
 * one, a pipeline's settings may, and every API collection and data contract is read as one -- the word it was
 * given (PHI, CONFIDENTIAL...) is kept beside the level as `sensitivityLabel`.
 */
export type SensitivityLevel = 'public' | 'internal' | 'sensitive';

export const SENSITIVITY_LEVELS: readonly SensitivityLevel[] = ['public', 'internal', 'sensitive'];

export const SENSITIVITY_TEXT: Record<SensitivityLevel, { label: string; blurb: string }> = {
  public: { label: 'Public', blurb: 'Data anyone may see: published figures, open datasets and APIs.' },
  internal: { label: 'Internal', blurb: 'The workspace\'s everyday data. A call is internal when nothing says otherwise.' },
  sensitive: { label: 'Sensitive', blurb: 'Personal, health or confidential data (PHI, PII, confidential, restricted).' },
};

/** The level a word is exactly, whatever its case; null for anything else. */
export function levelOf(word: string | null | undefined): SensitivityLevel | null {
  const w = (word ?? '').trim().toLowerCase();
  return (SENSITIVITY_LEVELS as readonly string[]).includes(w) ? w as SensitivityLevel : null;
}

/** A level as a person reads it; an unknown word as it is. */
export function sensitivityText(level: string | null | undefined): string {
  if (!level) return 'Not set';
  const known = levelOf(level);
  return known ? SENSITIVITY_TEXT[known].label : level;
}

/** The word a collection or contract was given, when it says something its level does not. */
export function typedWord(level: string | null | undefined, label: string | null | undefined): string | null {
  const word = (label ?? '').trim();
  if (!word) return null;
  return word.toLowerCase() === (level ?? '').trim().toLowerCase() ? null : word;
}

/** A collection's or contract's level, the word it was given beside it, or "not set" when it was given none. */
@Component({
  selector: 'app-sensitivity',
  host: { class: 'inline-flex items-center gap-1 flex-wrap' },
  template: `
    @if (level()) {
      <span class="pill pill-neutral" [title]="title()">{{ text() }}</span>
      @if (word()) { &ngsp;<span class="text-xs mono text-[color:var(--text-muted)]" title="The word it was given">{{ word() }}</span> }
      @else if (!label()) { &ngsp;<span class="text-xs text-[color:var(--text-muted)]">not set</span> }
    } @else {
      <span class="text-xs text-[color:var(--text-muted)]">—</span>
    }
  `,
})
export class SensitivityTag {
  readonly level = input<string | null | undefined>(null);
  /** The word as given; null or left out when none was ("not set"). */
  readonly label = input<string | null | undefined>(undefined);
  readonly text = computed(() => sensitivityText(this.level()));
  readonly word = computed(() => typedWord(this.level(), this.label()));
  readonly title = computed(() => this.label()
    ? `The data policy for ${this.text().toLowerCase()} data applies`
    : `Nothing was set, so it is read as ${this.text().toLowerCase()}`);
}
