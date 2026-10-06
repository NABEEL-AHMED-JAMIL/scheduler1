import { boardSettingsString, compactSettings, parseBoardSettings, parseSettings, settingGroups } from './chart-settings';
import { ECHART_KIND_IDS } from '../widget-kinds';

describe('chart settings, as stored', () => {
  it('reads nothing as every default, whatever the widget holds', () => {
    for (const raw of [undefined, null, 'x', 4, [], {}, { legend: 'top' }, { topN: 'ten' }]) {
      expect(parseSettings(raw)).toEqual({});
    }
  });

  it('keeps valid fields and drops the rest, field by field', () => {
    const parsed = parseSettings({
      legend: { position: 'bottom', show: 'yes' },
      bar: { stack: 'percent', width: 500, radius: 4 },
      topN: 10, sort: 'sideways', colors: { theme: 'vintage', order: [2, 0, -1, 'x'] },
      xAxis: { min: 0, log: true, rotate: 400 }, renderer: 'svg', refLines: { target: 12.5, label: 'Plan' },
    });
    expect(parsed).toEqual({
      legend: { position: 'bottom' }, bar: { stack: 'percent', radius: 4 }, topN: 10,
      colors: { theme: 'vintage', order: [2, 0] }, xAxis: { min: 0, log: true }, renderer: 'svg',
      refLines: { target: 12.5, label: 'Plan' },
    });
  });

  it('stores only what differs: empty settings are not stored at all', () => {
    expect(compactSettings({})).toBeUndefined();
    expect(compactSettings({ legend: {}, title: { text: '  ' } })).toBeUndefined();
    expect(compactSettings({ zoom: false })).toEqual({ zoom: false });
  });

  it('reads and writes the board\'s theme, and stores the console\'s own as nothing', () => {
    expect(parseBoardSettings('{"theme":"roma"}')).toEqual({ theme: 'roma' });
    expect(parseBoardSettings('not json')).toEqual({});
    expect(parseBoardSettings(null)).toEqual({});
    expect(boardSettingsString({ theme: 'roma' })).toBe('{"theme":"roma"}');
    expect(boardSettingsString({ theme: 'console' })).toBeNull();
    expect(boardSettingsString({})).toBeNull();
  });
});

describe('which settings a kind offers', () => {
  it('offers the console\'s SVG kinds their colours only', () => {
    expect(settingGroups('bar')).toEqual(['colors']);
    expect(settingGroups('donut')).toEqual(['colors']);
  });

  it('offers axes only to kinds with axes, series settings only to their series, and pie radii only to pies', () => {
    expect(settingGroups('barH')).toEqual(expect.arrayContaining(['axes', 'bar', 'sortTop', 'refLines', 'zoom']));
    expect(settingGroups('lineSmooth')).toEqual(expect.arrayContaining(['axes', 'line', 'zoom']));
    expect(settingGroups('lineSmooth')).not.toContain('pie');
    expect(settingGroups('rose')).toEqual(expect.arrayContaining(['pie', 'sortTop']));
    expect(settingGroups('rose')).not.toContain('axes');
    expect(settingGroups('treemap')).not.toContain('legend');
    expect(settingGroups('gauge')).not.toContain('axes');
  });

  it('offers every ECharts kind a title, a tooltip, colours, animation, renderer and the toolbox', () => {
    for (const kind of ECHART_KIND_IDS) {
      expect(settingGroups(kind), kind).toEqual(expect.arrayContaining(['title', 'tooltip', 'colors', 'animation', 'renderer', 'toolbox']));
    }
  });

  it('offers nothing for a kind it does not know', () => {
    expect(settingGroups('hologram')).toEqual([]);
  });
});
