import { LOG_LEVELS } from './server-log.js'
import type { LogLevel } from './server-log.js'

/**
 * How much the server logs, read from `FORMANCY_LOG_LEVEL`
 * ([0168](../../../docs/decisions/0168-the-log-is-built-from-a-list-of-fields.md)).
 *
 * Unset or empty is `info`: a line per request and per error. The log is on unless somebody
 * turns it off, because off is the state this setting replaced, where nothing said why a
 * request failed. `off` keeps no log at all; anything else that is not one of pino's level
 * names, spelled as pino spells them, stops the server at startup — a server that started
 * anyway would log at a level nobody chose, or not at all while its operator believed it
 * did. Its own module because `main.ts` connects to a database when it is imported, so
 * nothing in it can be tested.
 */
export function logLevelFrom(env: Readonly<Record<string, string | undefined>>): LogLevel | 'off' {
  const value = env['FORMANCY_LOG_LEVEL']?.trim() ?? ''
  if (value === '') return 'info'
  if (value === 'off') return value
  const level = LOG_LEVELS.find((known) => known === value)
  if (level === undefined) {
    throw new Error(
      `FORMANCY_LOG_LEVEL is "${value}", which is not a level this server has. Write one of ` +
        `off, ${LOG_LEVELS.join(', ')} — or leave it unset for info.`,
    )
  }
  return level
}
