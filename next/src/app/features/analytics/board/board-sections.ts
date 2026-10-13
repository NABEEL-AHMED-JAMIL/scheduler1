/**
 * A board's sections: headings that open a part of the board -- "Overview", "Where the time goes", "The rows" -- each
 * standing before one widget. Kept in the board's settings (dashboard_config.sections) as the id of the widget a
 * heading stands before, so moving a widget moves its heading with it and removing it removes the heading.
 *
 * @author Nabeel Ahmed
 */

export interface BoardSection {
  /** The widget the heading stands before. */
  before: number;
  title: string;
  subtitle?: string;
}

/** The sections a board's settings hold, each held to its shape, one per widget. */
export function parseSections(raw: unknown): BoardSection[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: BoardSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const before = typeof o['before'] === 'number' && Number.isInteger(o['before']) ? o['before'] : null;
    const title = typeof o['title'] === 'string' ? o['title'].trim().slice(0, 120) : '';
    if (before === null || !title || seen.has(before)) continue;
    seen.add(before);
    const section: BoardSection = { before, title };
    if (typeof o['subtitle'] === 'string' && o['subtitle'].trim()) section.subtitle = o['subtitle'].trim().slice(0, 240);
    out.push(section);
  }
  return out;
}

/** The heading before each widget, by id. */
export function sectionsByWidget(sections: readonly BoardSection[]): ReadonlyMap<number, BoardSection> {
  return new Map(sections.map(section => [section.before, section]));
}

/**
 * Where the rows break: the indexes of the widgets a heading stands before. A heading starts a new row, so each run of
 * widgets between two headings fills its own rows (fillRows per run).
 */
export function segmentsOf(widgetIds: readonly (number | undefined)[], sections: readonly BoardSection[]): number[][] {
  const starts = new Set(sections.map(s => s.before));
  const segments: number[][] = [];
  let current: number[] = [];
  widgetIds.forEach((id, i) => {
    if (id !== undefined && starts.has(id) && current.length) {
      segments.push(current);
      current = [];
    }
    current.push(i);
  });
  if (current.length) segments.push(current);
  return segments;
}

/** The sections with one added, changed (same widget) or removed (an empty title). */
export function withSection(sections: readonly BoardSection[], section: BoardSection): BoardSection[] {
  const rest = sections.filter(s => s.before !== section.before);
  return section.title.trim() ? [...rest, { ...section, title: section.title.trim() }] : rest;
}
