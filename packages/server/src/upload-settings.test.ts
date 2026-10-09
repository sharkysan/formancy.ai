import { describe, expect, test } from 'vitest'
import { createApp } from './app.js'
import type { Storage } from '@formancy/server-core'
import {
  DEFAULT_MAX_FILE_BYTES,
  LARGEST_MAX_FILE_BYTES,
  checkedMaxFileBytes,
  maxFileBytesFrom,
} from './upload-settings.js'

/**
 * The operator's ceiling on a file, read from the environment.
 *
 * Every size the server accepts is at most this number, and every size it accepts is
 * written to `files.size`, a PostgreSQL `integer`. A ceiling above what that column holds
 * let an offer through the route and failed it at the insert, as a 500 naming the query;
 * a fractional one was a ceiling no whole number of bytes could reach exactly. Whether
 * 2,147,483,647 is still what the column holds is checked against the database itself, in
 * `server.integration.test.ts`.
 */
describe('FORMANCY_MAX_FILE_BYTES', () => {
  test('unset is the documented ten megabytes', () => {
    // The default the self-hosting page and .env.example both state.
    expect(maxFileBytesFrom({})).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(DEFAULT_MAX_FILE_BYTES).toBe(10_485_760)
  })

  test('a whole number of bytes is taken as written', () => {
    // The ordinary case, which an over-eager check would refuse along with the bad ones.
    expect(maxFileBytesFrom({ FORMANCY_MAX_FILE_BYTES: '52428800' })).toBe(52_428_800)
  })

  test('the largest size the files table holds is allowed, and one byte more is not', () => {
    // An off-by-one at the boundary would either refuse the largest storable ceiling or
    // admit the first one whose offers fail at the insert.
    expect(maxFileBytesFrom({ FORMANCY_MAX_FILE_BYTES: String(LARGEST_MAX_FILE_BYTES) })).toBe(
      LARGEST_MAX_FILE_BYTES,
    )
    expect(() =>
      maxFileBytesFrom({ FORMANCY_MAX_FILE_BYTES: String(LARGEST_MAX_FILE_BYTES + 1) }),
    ).toThrow(/FORMANCY_MAX_FILE_BYTES.*2147483647/)
  })

  test('a ceiling of gigabytes past the column is refused at startup, not at the first upload', () => {
    // Five gigabytes: a plausible thing to type, and every offer above 2 GiB would have
    // been a 500 at the insert.
    expect(() => maxFileBytesFrom({ FORMANCY_MAX_FILE_BYTES: '5368709120' })).toThrow(
      /FORMANCY_MAX_FILE_BYTES/,
    )
  })

  test.each([
    ['fractional', '10485760.5'],
    ['zero', '0'],
    ['negative', '-1'],
    ['empty', ''],
    ['a unit rather than a number', '10MB'],
    ['not a number at all', 'ten megabytes'],
  ])('a value that is %s is refused, with the variable named', (_label, value) => {
    // Each was either NaN, a size no file can have, or a fraction no byte count reaches —
    // and a misread setting is cheapest to fix while the server refuses to start.
    expect(() => maxFileBytesFrom({ FORMANCY_MAX_FILE_BYTES: value })).toThrow(
      /FORMANCY_MAX_FILE_BYTES/,
    )
  })
})

describe('the same ceiling, passed to createApp by a deployment that embeds the server', () => {
  // A deployment embedding @formancy/server never reads the environment, so the check has
  // to be where the number is used as well, or the route's arithmetic rests on main.ts.
  const storage = {} as Storage

  test('is refused above what the files table holds', async () => {
    await expect(
      createApp(storage, {
        authSecret: 'unit-test-secret-with-enough-length',
        maxFileBytes: LARGEST_MAX_FILE_BYTES + 1,
      }),
    ).rejects.toThrow(/maxFileBytes/)
  })

  test('and when it is not a whole number', async () => {
    await expect(
      createApp(storage, { authSecret: 'unit-test-secret-with-enough-length', maxFileBytes: 1.5 }),
    ).rejects.toThrow(/maxFileBytes/)
  })

  test('checkedMaxFileBytes names whatever it was given to check', () => {
    // The message is the operator's only clue which setting to fix.
    expect(() => checkedMaxFileBytes(0, 'someSetting')).toThrow(/someSetting/)
    expect(checkedMaxFileBytes(1, 'someSetting')).toBe(1)
  })
})
