import { DatePipe } from '@angular/common';
import { Inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { instantOf } from '../../core/instant';
import { resolveFormat } from './time-format';

/**
 * Angular's date pipe for times this API sent: `{{ run.startTime | serverTime:'recent' }}`, with the
 * format named from time-format.ts (MIG-295).
 *
 * The API's timestamps are Chicago wall-clock readings with no offset (see core/instant.ts). The
 * plain date pipe reads such a string as the viewer's own local time, which is right only for a
 * viewer in Chicago -- everyone else saw every run, log line and queue entry hours off. This pipe
 * converts exactly those strings and nothing else:
 *
 *  - an offset-less date-time is read as server time;
 *  - a timestamp with Z or +hh:mm is taken at its word;
 *  - a calendar day ("2026-09-01") is left to the date pipe, which keeps it on its own day;
 *  - a Date or epoch number -- something the browser made -- passes straight through.
 *
 * So it is safe on any value a template formats, and it is the one to use.
 *
 * @author Nabeel Ahmed
 */
@Pipe({ name: 'serverTime' })
export class ServerTimePipe implements PipeTransform {

  private readonly date: DatePipe;

  constructor(@Inject(LOCALE_ID) locale: string) {
    this.date = new DatePipe(locale);
  }

  transform(value: string | number | Date | null | undefined, format?: string, timezone?: string,
            locale?: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    const moment = typeof value === 'string' && /\d{2}:\d{2}/.test(value) ? instantOf(value) : value;
    // A name from time-format.ts ('date', 'recent', ...) or one of Angular's presets becomes the
    // console's 24-hour pattern; no format at all is 'dateTime' rather than Angular's US 'mediumDate'.
    return moment === null ? null : this.date.transform(moment, resolveFormat(format), timezone, locale);
  }
}
