/**
 * How large a file this deployment accepts.
 *
 * Its own module because `main.ts` is a composition root that connects to a database
 * when it is imported, so nothing in it can be tested — and this is a setting whose wrong
 * values all look plausible.
 */

/** Ten megabytes: what the documentation and `.env.example` give as the default. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * The largest ceiling a deployment may set: the largest number `files.size` can hold.
 *
 * That column is a PostgreSQL `integer` (`db.ts`), a signed 32-bit number. Every size an
 * offer accepts is written to it, so a ceiling above this would let an offer through the
 * route and fail it at the insert. Raising it means widening the column first;
 * `server.integration.test.ts` reads the column's precision from the database and fails
 * when this number and the column disagree.
 */
export const LARGEST_MAX_FILE_BYTES = 2_147_483_647

/**
 * `value`, once it is a ceiling the server can honour: a whole number of bytes, at least
 * one, and no more than `files.size` holds. Throws naming `setting`, because the message
 * is all an operator has to go on.
 */
export function checkedMaxFileBytes(value: number, setting: string): number {
  if (!Number.isInteger(value) || value < 1 || value > LARGEST_MAX_FILE_BYTES) {
    throw new Error(
      `${setting} must be a whole number of bytes from 1 to ${String(LARGEST_MAX_FILE_BYTES)}, ` +
        'the largest size the files table holds.',
    )
  }
  return value
}

/**
 * The ceiling `FORMANCY_MAX_FILE_BYTES` sets, or the default when it is unset.
 *
 * Empty is refused rather than read as unset: the compose files already substitute the
 * default for an empty value, so an empty one here was set by hand, to something.
 */
export function maxFileBytesFrom(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env['FORMANCY_MAX_FILE_BYTES']
  if (raw === undefined) return DEFAULT_MAX_FILE_BYTES
  // Number('') is 0 and Number('10MB') is NaN, and the range refuses both.
  return checkedMaxFileBytes(Number(raw), 'FORMANCY_MAX_FILE_BYTES')
}
