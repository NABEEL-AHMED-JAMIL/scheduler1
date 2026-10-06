/**
 * Reading a timestamp this backend sent.
 *
 * Every time the REST API hands out is a Java `LocalDateTime` — "2026-09-14T17:02:13.271" — which
 * carries NO offset. `new Date(...)` reads an offset-less timestamp as the READER's local time,
 * which is right only by coincidence: right for a viewer sitting in the same zone as the server,
 * and wrong by hours for everyone else.
 *
 * The server's zone is not a guess. ModelApplication.main pins it:
 *
 *     TimeZone.setDefault(TimeZone.getTimeZone("America/Chicago"));
 *
 * so every LocalDateTime this platform writes — into the database and onto the wire — is a Chicago
 * wall-clock reading, whatever the host underneath it is set to. The container's OS is UTC and the
 * application overrides it at startup, which is why `date` inside process_app and the
 * application's own log timestamps disagree by five hours; the database follows the application,
 * not the OS. Naive timestamps are therefore read here as Chicago: not as UTC, and not as
 * "wherever the reader happens to be".
 *
 * A timestamp that DOES carry an offset is taken at its word. JobEventPublisher sends real
 * instants over the socket ("…Z"), so those are unambiguous, and this keeps working if the REST
 * side ever starts doing the same — which is the proper fix, and is not this.
 *
 * @author Nabeel Ahmed
 */

/**
 * The zone the server writes its wall-clock timestamps in, per ModelApplication.main.
 *
 * If that line changes, this must change with it. The client cannot detect the difference,
 * because the value on the wire carries no offset to detect it from.
 */
export const SERVER_ZONE = 'America/Chicago';

/**
 * True when a timestamp already says which offset it is in — a trailing Z, or a +hh:mm / -hh:mm
 * after the time part. Measured from where the TIME starts, because the date's own dashes would
 * otherwise read as an offset sign; the separator may be a T or a space.
 */
function carriesOffset(text: string): boolean {
  const at = text.search(/[T ]\d{2}:/);
  const time = at >= 0 ? text.slice(at) : text;
  return /[zZ]$/.test(time) || /[+-]\d{2}:?\d{2}$/.test(time);
}

/** Whether this is a moment in a day rather than a calendar day. */
function carriesTime(text: string): boolean {
  return /\d{2}:\d{2}/.test(text);
}

/**
 * How far a zone's wall clock is ahead of UTC at a given instant, in milliseconds.
 *
 * Measured against the instant FLOORED TO THE SECOND, because formatToParts resolves no finer
 * than that: comparing a second-precision wall clock with a millisecond-precision instant folds
 * those milliseconds into the "offset", and the refinement pass below then applies the error a
 * second time. A LocalDateTime carries milliseconds, so that was not hypothetical — .271 came
 * back as .813.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  // Some engines render midnight as hour 24.
  const wallClock = Date.UTC(
    Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']),
    Number(parts['hour']) % 24, Number(parts['minute']), Number(parts['second']));
  const toTheSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return wallClock - toTheSecond;
}

/** The instant at which the server's clock read this wall-clock time. */
function fromServerWallClock(naive: string): Date | null {
  const asIfUtc = new Date(`${naive.replace(' ', 'T')}Z`);
  if (!Number.isFinite(asIfUtc.getTime())) return null;
  const offset = zoneOffsetMs(asIfUtc, SERVER_ZONE);
  const candidate = new Date(asIfUtc.getTime() - offset);
  // One refinement, for a reading that lands near a daylight-saving change: the offset that
  // applies is the one in force at the resulting instant, not at the provisional one.
  const settled = zoneOffsetMs(candidate, SERVER_ZONE);
  return settled === offset ? candidate : new Date(asIfUtc.getTime() - settled);
}

/**
 * A timestamp from this API as a real instant.
 *
 * Returns null for absent or unparseable input rather than an Invalid Date, so callers get
 * something they must handle instead of a value that silently compares false to everything.
 */
export function instantOf(text: string | null | undefined): Date | null {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;

  // A date with no time is a calendar day, not an instant; shifting it by an offset would move it
  // a day for a reader on one side of the server.
  if (!carriesTime(trimmed)) {
    const day = new Date(trimmed);
    return Number.isFinite(day.getTime()) ? day : null;
  }
  if (carriesOffset(trimmed)) {
    const stated = new Date(trimmed.replace(' ', 'T'));
    return Number.isFinite(stated.getTime()) ? stated : null;
  }
  return fromServerWallClock(trimmed);
}

/** The same instant in milliseconds, or null. For arithmetic against Date.now(). */
export function instantMs(text: string | null | undefined): number | null {
  const parsed = instantOf(text);
  return parsed ? parsed.getTime() : null;
}
