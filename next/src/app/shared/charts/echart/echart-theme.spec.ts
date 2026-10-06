import { TestBed } from '@angular/core/testing';
import {
  ChartTokenSet, LABEL_CONTRAST, MIN_FILL_CONTRAST, NAMED_THEMES, THEME_IDS, blend, buildTheme, contrast, inkOn,
  legibleOn, ordered, paletteFor, themeKey, toRgb,
} from './echart-theme';
import { ChartTokens } from './chart-tokens';
import { ChartThemes } from './chart-themes';

const LIGHT: ChartTokenSet = {
  mode: 'light', palette: ['#2563eb', '#be1d63', '#0f766e', '#7e22ce', '#c2410c', '#0e7490', '#4d7c0f', '#4338ca'],
  text: '#101828', textSecondary: '#4a5565', muted: '#6a7282', border: '#e5e7eb', surface: '#ffffff', sunken: '#f3f4f6',
  heat: '#2563eb', up: '#166534', down: '#a01b34', font: 'Inter',
};
const DARK: ChartTokenSet = { ...LIGHT, mode: 'dark', surface: '#101828', text: '#f9fafb', textSecondary: '#d1d5dc', muted: '#99a1af', border: '#1e2939' };

describe('chart themes from the console\'s tokens', () => {
  it('builds the chrome from the tokens: text, axes, tooltip surface, and the console\'s type', () => {
    const theme = buildTheme(LIGHT, LIGHT.palette) as Record<string, Record<string, unknown>>;
    expect(theme['color']).toEqual(LIGHT.palette);
    expect(theme['tooltip']['backgroundColor']).toBe('#ffffff');
    expect(theme['tooltip']['borderColor']).toBe('#e5e7eb');
    expect((theme['textStyle'] as Record<string, unknown>)['fontFamily']).toBe('Inter');
    expect(((theme['categoryAxis']['axisLabel']) as Record<string, unknown>)['color']).toBe('#4a5565');
    expect(theme['animationDuration']).toBeLessThanOrEqual(300);
  });

  it('writes every piece of chart text in a text token, never ECharts\' default grey', () => {
    for (const tokens of [LIGHT, DARK]) {
      const theme = buildTheme(tokens, tokens.palette) as Record<string, Record<string, Record<string, unknown>>>;
      const text = [tokens.text, tokens.textSecondary];
      for (const axis of ['categoryAxis', 'valueAxis', 'logAxis', 'timeAxis']) {
        expect(text).toContain(theme[axis]['axisLabel']['color']);
        expect(text).toContain(theme[axis]['nameTextStyle']['color']);
      }
      expect(text).toContain(theme['legend']['textStyle']['color']);
      expect(text).toContain(theme['title']['textStyle']['color']);
      expect(text).toContain(theme['title']['subtextStyle']['color']);
      expect(text).toContain(theme['tooltip']['textStyle']['color']);
      expect(theme['tooltip']['backgroundColor']).toBe(tokens.surface);
      expect(text).toContain(theme['dataZoom']['textStyle']['color']);
      expect(text).toContain(theme['visualMap']['textStyle']['color']);
      expect(text).toContain(theme['calendar']['dayLabel']['color']);
      expect(text).toContain(theme['calendar']['monthLabel']['color']);
      expect(text).toContain(theme['markLine']['label']['color']);
      expect(text).toContain(theme['gauge']['detail']['color']);
      expect(JSON.stringify(theme)).not.toContain('#6E7079');
      // Readable on the card at the 4.5:1 text floor, in both modes.
      expect(contrast(toRgb(theme['categoryAxis']['axisLabel']['color'] as string)!, toRgb(tokens.surface)!)).toBeGreaterThanOrEqual(LABEL_CONTRAST);
    }
  });
});

describe('the ink for a label on a fill', () => {
  it('is black or white, whichever reads at 4.5:1 or better, for every palette in both modes', () => {
    for (const tokens of [LIGHT, DARK]) {
      for (const id of THEME_IDS) {
        for (const fill of paletteFor(id, tokens).colors) {
          const ink = inkOn(fill);
          expect(['#000000', '#ffffff']).toContain(ink);
          expect(contrast(toRgb(ink)!, toRgb(fill)!)).toBeGreaterThanOrEqual(LABEL_CONTRAST);
        }
      }
    }
  });

  it('picks white on a dark fill and black on a light one, and even a mid grey clears the floor', () => {
    expect(inkOn('#101828')).toBe('#ffffff');
    expect(inkOn('#fde68a')).toBe('#000000');
    expect(inkOn('rgb(37, 99, 235)')).toBe('#ffffff');
    for (let v = 0; v <= 255; v += 5) {
      const grey = `rgb(${v}, ${v}, ${v})`;
      expect(contrast(toRgb(inkOn(grey))!, [v, v, v])).toBeGreaterThanOrEqual(LABEL_CONTRAST);
    }
  });

  it('falls back to dark ink for a fill it cannot read, and blends two colours by a share', () => {
    expect(inkOn('linear-gradient(red, blue)')).toBe('#000000');
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blend('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(blend('nonsense', '#ffffff', 0.5)).toBe('nonsense');
  });
});

describe('chart palettes for every theme', () => {

  it('keeps the console theme as the tokens, untouched', () => {
    expect(paletteFor('console', LIGHT)).toEqual({ colors: LIGHT.palette.slice(0, 8), adjusted: 0, derived: false });
  });

  it('ships the named palettes from the echarts package, eight colours each, the console\'s first in the list', () => {
    expect(THEME_IDS[0]).toBe('console');
    expect(NAMED_THEMES.length).toBeGreaterThanOrEqual(8);
    for (const theme of NAMED_THEMES) {
      expect(theme.file, theme.id).toMatch(/^echarts\/theme\/[\w-]+\.js$/);
      expect(theme.colors.length, theme.id).toBe(8);
    }
  });

  it('holds every named palette to 3:1 against the card, in light and in dark', () => {
    for (const tokens of [LIGHT, DARK]) {
      for (const theme of NAMED_THEMES) {
        for (const colour of paletteFor(theme.id, tokens).colors) {
          expect(contrast(toRgb(colour)!, toRgb(tokens.surface)!), `${theme.id} ${tokens.mode} ${colour}`)
            .toBeGreaterThanOrEqual(MIN_FILL_CONTRAST - 0.001);
        }
      }
    }
  });

  it('says when a palette is the console\'s derivation for the other mode', () => {
    expect(paletteFor('vintage', LIGHT).derived).toBe(false);
    expect(paletteFor('vintage', DARK).derived).toBe(true);
    expect(paletteFor('midnight', LIGHT).derived).toBe(true);
  });

  it('moves a colour that is too faint toward the ink, and leaves one that reads alone', () => {
    expect(legibleOn('#2563eb', '#ffffff', 'light')).toBe('#2563eb');
    const cream = legibleOn('#f5e8c8', '#ffffff', 'light');
    expect(contrast(toRgb(cream)!, [255, 255, 255])).toBeGreaterThanOrEqual(MIN_FILL_CONTRAST);
  });

  it('orders a palette as the widget chose, the rest following', () => {
    expect(ordered(['a', 'b', 'c', 'd'], [2, 0])).toEqual(['c', 'a', 'b', 'd']);
    expect(ordered(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });

  it('registers a theme per mode, so switching mode switches the theme ECharts draws', () => {
    expect(themeKey('vintage', 'light')).toBe('vintage-light');
    expect(themeKey('vintage', 'dark')).toBe('vintage-dark');
    expect(themeKey('nonsense', 'dark')).toBe('console-dark');
  });
});

describe('switching theme live', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('re-reads the tokens when the page flips to dark, and every resolved theme follows', async () => {
    const tokens = TestBed.inject(ChartTokens);
    const themes = TestBed.inject(ChartThemes);
    expect(tokens.tokens().mode).toBe('light');
    expect(themes.resolve('vintage').ref.key).toBe('vintage-light');
    document.documentElement.classList.add('dark');
    await new Promise(resolve => setTimeout(resolve));
    expect(tokens.tokens().mode).toBe('dark');
    expect(themes.resolve('vintage').ref.key).toBe('vintage-dark');
    expect(themes.resolve(null).ref.key).toBe('console-dark');
  });
});
