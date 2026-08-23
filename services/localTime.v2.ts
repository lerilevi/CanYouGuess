/**
 * localTime.v2.ts
 *
 * ⚠️  NOT WIRED IN. Part of the OnSpace-exit prep set.
 *
 * The backend resets each user's day at their own local midnight, so the
 * client is the authority on what "today" is. These helpers produce the two
 * values every score submission carries.
 *
 * Deliberately not using toISOString(): that yields the UTC date, which is the
 * exact bug this design exists to avoid. At 01:00 in Tel Aviv the UTC date is
 * still yesterday.
 */

/** Local calendar date as YYYY-MM-DD, per the device's own clock. */
export function getLocalDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Minutes east of UTC (Tel Aviv in summer → +180).
 * getTimezoneOffset() reports minutes *behind* UTC, hence the negation.
 */
export function getTimezoneOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}

/**
 * IANA zone name, e.g. "Asia/Jerusalem". Returns null when the runtime has no
 * usable Intl data, in which case the server keeps the last known zone rather
 * than being handed a wrong one.
 */
export function getTimezoneName(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Some minimal ICU builds report 'UTC' for everything; treat an empty or
    // missing value as unknown rather than asserting UTC.
    return tz && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}
