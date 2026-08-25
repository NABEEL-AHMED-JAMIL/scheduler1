import { Component, computed, input, isDevMode } from '@angular/core';

/**
 * One stroke-based icon set for the whole app. Paths are drawn on a 24x24 grid with a 2px
 * stroke so every icon shares a weight -- mixing sets is the usual reason toolbars look
 * unfinished. Sized in em so an icon tracks the type size of the button it sits in.
 */
const PATHS: Record<string, string> = {
  refresh:   'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  plus:      'M12 5v14M5 12h14',
  minus:     'M5 12h14',
  edit:      'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  trash:     'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  download:  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload:    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  search:    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  close:     'M18 6 6 18M6 6l12 12',
  check:     'M20 6 9 17l-5-5',
  play:      'M6 3l14 9-14 9V3Z',
  skip:      'M5 4l10 8-10 8V4ZM19 5v14',
  pause:     'M6 4h4v16H6zM14 4h4v16h-4z',
  stop:      'M7 7h10v10H7z',
  terminal:  'M4 17l6-5-6-5M12 19h8',
  code:      'm16 18 6-6-6-6M8 6l-6 6 6 6',
  mic:       'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v4M8 22h8',
  filter:    'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  eye:       'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  copy:      'M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2ZM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  folder:    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z',
  file:      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6',
  send:      'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  chat:      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  bell:      'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  clock:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  calendar:  'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18',
  database:  'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3ZM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  server:    'M20 2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM20 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2ZM6 6h.01M6 18h.01',
  chart:     'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  user:      'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  users:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  link:      'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  external:  'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  alert:     'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01',
  info:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  chevronDown:  'm6 9 6 6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  chevronLeft:  'm15 18-6-6 6-6',
  arrowLeft:    'M19 12H5M12 19l-7-7 7-7',
  dots:      'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  sun:       'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon:      'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
  sparkle:   'M12 3l1.9 5.8L20 10.7l-5.1 2 -1.9 5.8-1.9-5.8L6 10.7l5.1-1.9L12 3Z',
  zap:       'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  layers:    'M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5',
  list:      'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  menu:      'M3 6h18M3 12h18M3 18h18',
  arrowUp:   'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  arrowRight:'M5 12h14M12 5l7 7-7 7',
  chevronUp: 'm18 15-6-6-6 6',
  sort:      'm8 9 4-4 4 4M8 15l4 4 4-4',
  checkCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8.5 12.5l2.5 2.5 4.5-5',
  xCircle:   'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM15 9l-6 6M9 9l6 6',
  plug:      'M12 22v-5M9 7V2M15 7V2M6 7h12v4a6 6 0 0 1-12 0V7Z',
  key:       'M15.5 7.5a5.5 5.5 0 1 1-4.35 8.86l-1.4 1.4H8v2H6v2H2v-4l6.24-6.24A5.5 5.5 0 0 1 15.5 7.5Z M17 10h.01',
  shield:    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  lock:      'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4',
  power:     'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  inbox:     'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z',
  globe:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z',
  cloud:     'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z',
  history:   'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2',
  table:     'M3 3h18v18H3V3Z M3 9h18 M3 15h18 M9 3v18',
  volume:    'M11 5 6 9H2v6h4l5 4V5Z M15.5 8.5a5 5 0 0 1 0 7 M19 5a9 9 0 0 1 0 14',
  volumeOff: 'M11 5 6 9H2v6h4l5 4V5Z M23 9l-6 6 M17 9l6 6',
  maximize:  'M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M3 16v3a2 2 0 0 0 2 2h3',
  save:      'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  // A sheet with a header band and ruled lines: a form definition rather than a plain document.
  template:  'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 9h18M7 13h10M7 17h6',
  // An office block, for a tenant: the Tenants screen has been asking for this name all along.
  building:  'M3 21h18M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M13 21V10h5a1 1 0 0 1 1 1v10M8 8h2M8 12h2M8 16h2',
};

@Component({
  selector: 'app-icon',
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" fill="none" stroke="currentColor"
         [attr.stroke-width]="strokeWidth()" stroke-linecap="round" stroke-linejoin="round"
         [style.width]="size()" [style.height]="size()"
         class="inline-block shrink-0 align-[-0.125em]"
         [attr.aria-hidden]="label() ? null : 'true'"
         [attr.role]="label() ? 'img' : null"
         [attr.aria-label]="label() || null">
      @for (segment of segments(); track $index) {
        <path [attr.d]="segment" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input('1em');
  readonly strokeWidth = input(1.9);
  readonly label = input('');

  /** Multi-part glyphs are stored space-separated so each subpath closes cleanly. */
  readonly segments = computed(() => {
    const path = PATHS[this.name()];
    if (!path) {
      // An unknown name used to render an empty <svg>: the glyph vanished, the layout kept
      // its space, and nothing complained. Typos reached production that way.
      if (isDevMode()) {
        console.error(`[app-icon] no glyph named "${this.name()}" -- nothing will render.`);
      }
      return [];
    }
    return path.split(/(?<=[Zz])\s+(?=[Mm])/).map(p => p.trim()).filter(Boolean);
  });
}
