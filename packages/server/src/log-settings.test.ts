import { describe, expect, test } from 'vitest'
import { logLevelFrom } from './log-settings.js'
import { LOG_LEVELS } from './server-log.js'

/**
 * `FORMANCY_LOG_LEVEL`, read once at startup (0168).
 *
 * A value the server cannot read stops it, as every other setting here does: a server
 * that started anyway would log at a level nobody chose, or not at all while its operator
 * believed it was logging.
 */
describe('the log level setting', () => {
  test('unset and empty are info: the log is on unless somebody turns it off', () => {
    // A default of off is the state this setting replaced, where nothing said why a
    // request failed. Empty is what compose hands over for `FORMANCY_LOG_LEVEL=` in `.env`.
    expect(logLevelFrom({})).toBe('info')
    expect(logLevelFrom({ FORMANCY_LOG_LEVEL: '' })).toBe('info')
    expect(logLevelFrom({ FORMANCY_LOG_LEVEL: '  ' })).toBe('info')
  })

  test.each(LOG_LEVELS)('%s is read as itself', (level) => {
    // A level that was refused, or read as another, would leave the operator with lines
    // they did not ask for or without the ones they did.
    expect(logLevelFrom({ FORMANCY_LOG_LEVEL: level })).toBe(level)
    expect(logLevelFrom({ FORMANCY_LOG_LEVEL: ` ${level} ` })).toBe(level)
  })

  test('off is off', () => {
    // The one way to keep no log, and it has to be said: an absent variable logs.
    expect(logLevelFrom({ FORMANCY_LOG_LEVEL: 'off' })).toBe('off')
  })

  test.each([
    // Another logger's word for off, which reads as configured and would be a level
    // nobody here defined.
    'silent',
    'none',
    'false',
    '0',
    // A level the server does not have.
    'verbose',
    'warning',
    // A second spelling of one it has.
    'INFO',
    'Debug',
  ])('%s is refused at startup, naming the variable and what to write', (value) => {
    // Started anyway, the server would pick a level for the operator, or keep no log while
    // they believed it did.
    expect(() => logLevelFrom({ FORMANCY_LOG_LEVEL: value })).toThrow(
      new RegExp(`FORMANCY_LOG_LEVEL is "${value}".*off, ${LOG_LEVELS.join(', ')}`),
    )
  })
})
