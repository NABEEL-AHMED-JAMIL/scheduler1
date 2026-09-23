import { Component, computed, input, output } from '@angular/core';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { Icon } from '../../../shared/ui/icon';
import { Avatar } from '../../../shared/ui/avatar';
import { AccessPerson, AccessProfile } from './access-profiles.service';

/** One column group in the header: a menu section and the pages under it. */
interface ColumnGroup { section: string; pages: PageCatalogueEntry[]; }

/** One cell, worked out once per render rather than per change-detection pass. */
interface Cell {
  page: PageCatalogueEntry;
  /** What the person actually gets: profile, adjusted by any exception. */
  open: boolean;
  /** What the profile alone says, so an exception can be shown as one. */
  profileSays: boolean;
  exception: boolean;
}

interface PersonRow { person: AccessPerson; cells: Cell[]; exceptions: number; }

/** People sharing a profile, under one header that shows the profile's own pattern. */
interface ProfileGroup {
  key: string;
  profile: AccessProfile | null;
  title: string;
  subtitle: string;
  opens: boolean[];
  rows: PersonRow[];
}

/**
 * The people × pages grid.
 *
 * People down the side, pages across the top, one cell per pair, derived from the profile each
 * person holds. Two things make it readable rather than a wall of ticks: the columns are
 * grouped under their menu section, and the rows are grouped under the profile they share --
 * the group header carries the profile's pattern, so a person's row is read as "same as the
 * header" unless the eye catches a difference, which is exactly when there is something to see.
 *
 * A cell is a checkbox that means what it says: tick it and that page opens for that person.
 * The profile is the baseline; a tick that differs from it is stored as an exception and shown
 * with a marker, and ticking back to what the profile says clears it. Everything here is
 * precomputed in one `computed`, so the template binds to values rather than calling helpers
 * per cell.
 */
@Component({
  selector: 'app-access-people-grid',
  imports: [Icon, Avatar],
  templateUrl: './access-people-grid.html',
})
export class AccessPeopleGrid {
  readonly people = input.required<AccessPerson[]>();
  readonly profiles = input.required<AccessProfile[]>();
  readonly pages = input.required<PageCatalogueEntry[]>();
  /** A filter typed by the admin: name, email or position. */
  readonly search = input('');
  /** The person whose assignment is in flight, so their row goes quiet. */
  readonly busy = input<number | null>(null);

  /** A person and the profile to put them on; null profile means the workspace default. */
  readonly assign = output<{ person: AccessPerson; profile: AccessProfile | null }>();
  /** One checkbox changed: open or withhold this page for this person. */
  readonly toggle = output<{ person: AccessPerson; page: PageCatalogueEntry; allowed: boolean }>();
  /** Drop every exception a person carries. */
  readonly reset = output<AccessPerson>();

  readonly groupsOfColumns = computed<ColumnGroup[]>(() => {
    const groups: ColumnGroup[] = [];
    for (const page of this.pages()) {
      const last = groups[groups.length - 1];
      if (last && last.section === page.section) last.pages.push(page);
      else groups.push({ section: page.section, pages: [page] });
    }
    return groups;
  });

  readonly defaultProfile = computed(() => this.profiles().find(p => p.defaultProfile) ?? null);

  private readonly filtered = computed(() => {
    const needle = this.search().trim().toLowerCase();
    if (!needle) return this.people();
    return this.people().filter(p =>
      [p.fullName, p.username, p.position ?? ''].some(v => v.toLowerCase().includes(needle)));
  });

  readonly groups = computed<ProfileGroup[]>(() => {
    const pages = this.pages();
    const profiles = this.profiles();
    const fallback = this.defaultProfile();
    const byProfile = new Map<string, ProfileGroup>();

    const groupFor = (person: AccessPerson): ProfileGroup => {
      const held = profiles.find(p => p.pageAccessProfileId === person.pageAccessProfileId) ?? null;
      const key = held ? String(held.pageAccessProfileId) : 'default';
      let group = byProfile.get(key);
      if (!group) {
        const source = held ?? fallback;
        group = {
          key,
          profile: held,
          title: held ? held.profileName : `Default${fallback ? ' · ' + fallback.profileName : ''}`,
          subtitle: held ? (held.description ?? '') : (fallback ? 'People with no profile of their own.' : 'No default set: these people open every page.'),
          opens: pages.map(page => source ? source.pageKeys.includes(page.key) : true),
          rows: [],
        };
        byProfile.set(key, group);
      }
      return group;
    };

    for (const person of this.filtered()) {
      const group = groupFor(person);
      const cells = pages.map((page, i) => {
        const open = person.pageKeys.includes(page.key);
        const profileSays = group.opens[i];
        return { page, open, profileSays, exception: open !== profileSays };
      });
      group.rows.push({ person, cells, exceptions: cells.filter(c => c.exception).length });
    }
    // Default first, then profiles in the order the cards use (by name).
    return [...byProfile.values()].sort((a, b) =>
      a.key === 'default' ? -1 : b.key === 'default' ? 1 : a.title.localeCompare(b.title));
  });

  readonly shown = computed(() => this.groups().reduce((n, g) => n + g.rows.length, 0));

  /**
   * Asks for the change; does not show it. The select is put straight back to the person's
   * current profile and moves only when the row comes back from the server -- a refused change
   * used to stay on screen, because nothing in the model had moved to redraw it.
   */
  pick(person: AccessPerson, value: string, select?: HTMLSelectElement): void {
    if (select) select.value = person.pageAccessProfileId == null ? '' : String(person.pageAccessProfileId);
    const id = Number(value);
    const profile = id > 0 ? (this.profiles().find(p => p.pageAccessProfileId === id) ?? null) : null;
    if ((profile?.pageAccessProfileId ?? null) === person.pageAccessProfileId) return;
    this.assign.emit({ person, profile });
  }

  /** Whether the page at this index starts a new section -- where a divider is drawn. */
  private readonly sectionStarts = computed(() => {
    const starts = new Set<number>();
    let i = 0;
    for (const group of this.groupsOfColumns()) { starts.add(i); i += group.pages.length; }
    return starts;
  });

  isFirstOfSection(index: number): boolean {
    return index > 0 && this.sectionStarts().has(index);
  }

  onToggle(person: AccessPerson, page: PageCatalogueEntry, checked: boolean): void {
    this.toggle.emit({ person, page, allowed: checked });
  }

}
