/**
 * One colour per value across a whole board: "Cardiology" is the same colour in the donut, the stacked area and the
 * treemap. A board's dimension filters already list their columns' values (most frequent first); the first of each list
 * gets the theme's first colour, and so on, so the most common values get the most distinct colours. A value no filter
 * lists keeps the colour its chart gives it.
 *
 * Applied to a finished ECharts option, before its labels are inked (chartOption), so a label inside a re-coloured
 * slice is still black or white against the colour it actually sits on.
 *
 * @author Nabeel Ahmed
 */

type Obj = Record<string, unknown>;

/** value -> palette slot, from the board's filters' value lists (each list most frequent first). */
export function colorKeysOf(domains: readonly (readonly string[])[], slots: number): ReadonlyMap<string, number> {
  const keys = new Map<string, number>();
  for (const values of domains) {
    values.slice(0, slots).forEach((value, i) => { if (!keys.has(value)) keys.set(value, i); });
  }
  return keys;
}

function paint(target: Obj, color: string): void {
  const style = (target['itemStyle'] as Obj | undefined) ?? {};
  target['itemStyle'] = { ...style, color };
}

/** Each data item, and each nested child (a treemap's, a sunburst's), named by a key. */
function paintItems(items: unknown, keys: ReadonlyMap<string, number>, palette: readonly string[]): unknown {
  if (!Array.isArray(items)) return items;
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const copy: Obj = { ...(item as Obj) };
    const slot = typeof copy['name'] === 'string' ? keys.get(copy['name']) : undefined;
    if (slot !== undefined) paint(copy, palette[slot % palette.length]);
    if (Array.isArray(copy['children'])) copy['children'] = paintItems(copy['children'], keys, palette);
    return copy;
  });
}

/**
 * The option with every series named by a key, and every named data item, in that key's colour. Series of the line and
 * bar families take it on their line, area and marks; a pie's, funnel's, treemap's or sunburst's items each take
 * their own. The option is copied where it is changed, never edited in place.
 */
export function applyColorKeys(option: Obj, keys: ReadonlyMap<string, number> | null | undefined, palette: readonly string[]): Obj {
  if (!keys || !keys.size || !palette.length) return option;
  const series = option['series'];
  if (!Array.isArray(series)) return option;
  let changed = false;
  const painted = series.map((one: Obj) => {
    const copy: Obj = { ...one };
    const slot = typeof copy['name'] === 'string' ? keys.get(copy['name']) : undefined;
    if (slot !== undefined) {
      const color = palette[slot % palette.length];
      paint(copy, color);
      if (copy['lineStyle'] || copy['type'] === 'line') copy['lineStyle'] = { ...((copy['lineStyle'] as Obj | undefined) ?? {}), color };
      if (copy['areaStyle']) copy['areaStyle'] = { ...(copy['areaStyle'] as Obj), color };
      changed = true;
    }
    const items = paintItems(copy['data'], keys, palette);
    if (items !== copy['data']) { copy['data'] = items; changed = true; }
    return copy;
  });
  return changed ? { ...option, series: painted } : option;
}
