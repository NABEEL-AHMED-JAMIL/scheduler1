import { Component, computed, input } from '@angular/core';
import { Icon } from './icon';

type Tone = 'ok' | 'crit' | 'warn' | 'brand' | 'neutral';

interface StatusLook {
  tone: Tone;
  /** A filled chip, used to separate two statuses that share a tone. */
  solid?: boolean;
  glyph: string;
  /**
   * Part of a run's lifecycle, as opposed to an entity's state. A run's status always stays a
   * full chip: quieting it would hide the very thing the column exists to report.
   */
  run?: boolean;
}

/**
 * One place that decides what a status looks like, so Failed is the same red everywhere.
 *
 * The eight run states used to collapse into four colours -- Queue, Start and Running were all
 * one indigo, Failed and Interrupt one red, Skip and Missed one amber -- so a queued run and a
 * working one were indistinguishable in a table. Rather than invent eight hues, which would
 * throw away the learned meaning of red and green, each family keeps its colour and the pair
 * inside it is separated by weight and by its own glyph. Shape carries the difference too,
 * which is what makes it work for anyone who cannot separate the hues.
 */
const LOOK: Record<string, StatusLook> = {
  // A run's life, in order.
  queue:     { tone: 'neutral', glyph: 'inbox',       run: true },
  start:     { tone: 'brand',   glyph: 'play',        run: true },
  running:   { tone: 'brand',   glyph: 'zap',         run: true, solid: true },
  completed: { tone: 'ok',      glyph: 'checkCircle', run: true },
  failed:    { tone: 'crit',    glyph: 'xCircle',     run: true, solid: true },
  interrupt: { tone: 'crit',    glyph: 'stop',        run: true },
  skip:      { tone: 'warn',    glyph: 'skip',        run: true },
  missed:    { tone: 'warn',    glyph: 'alert',       run: true, solid: true },

  // A workspace request's life. These were missing entirely, so all three fell through to
  // UNKNOWN and rendered as the same neutral grey -- three different outcomes that a reader had
  // to tell apart by reading the word.
  //
  // Pending is warn rather than neutral because it is the only one of the three that is asking
  // somebody to do something; approved and rejected are settled and can sit quietly.
  pending:   { tone: 'warn', glyph: 'clock' },
  approved:  { tone: 'ok',   glyph: 'checkCircle' },
  rejected:  { tone: 'crit', glyph: 'xCircle' },

  // An entity's state, which is a different question from how a run went.
  active:    { tone: 'ok',   glyph: 'checkCircle' },
  success:   { tone: 'ok',   glyph: 'checkCircle' },
  ok:        { tone: 'ok',   glyph: 'checkCircle' },
  inactive:  { tone: 'warn', glyph: 'alert' },
  suspended: { tone: 'warn', glyph: 'alert' },
  delete:    { tone: 'crit', glyph: 'xCircle' },
};

const UNKNOWN: StatusLook = { tone: 'neutral', glyph: '' };

@Component({
  selector: 'app-status',
  imports: [Icon],
  template: `
    @if (isQuiet()) {
      <span class="status-quiet">
        <span class="status-dot" [class]="'dot-' + tone()"></span>{{ label() || '—' }}
      </span>
    } @else {
      <span [class]="cls()">
        @if (showIcon() && glyph()) { <app-icon [name]="glyph()" size="0.85em" /> }
        {{ label() || '—' }}
      </span>
    }
  `,
})
export class StatusPill {
  readonly label = input<string | undefined | null>('');
  /** Shape as well as colour: red and green alone are the one pairing many people cannot separate. */
  readonly showIcon = input(true);
  /**
   * For a column where one value is the norm. Every job on the list is Active, so a filled
   * green chip on all 41 rows said nothing and drowned out the three that had actually
   * failed. Quiet only applies to the unremarkable tones -- an Inactive or Suspended row
   * still gets a full chip, which is the whole point of marking the rest down.
   */
  readonly quiet = input(false);

  private readonly look = computed<StatusLook>(() =>
    LOOK[(this.label() || '').toLowerCase()] ?? UNKNOWN);

  readonly tone = computed(() => this.look().tone);

  readonly isQuiet = computed(() => {
    const look = this.look();
    // Never quiet a run's own status, however ordinary it looks.
    if (look.run) return false;
    return this.quiet() && (look.tone === 'ok' || look.tone === 'neutral');
  });

  readonly cls = computed(() => {
    const look = this.look();
    return look.solid ? `pill pill-solid-${look.tone}` : `pill pill-${look.tone}`;
  });

  readonly glyph = computed(() => this.look().glyph);
}
