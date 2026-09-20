import { describe, expect, test } from 'vitest'
import { webhookUrlProblem } from './webhook-url.js'

describe('webhookUrlProblem', () => {
  test('accepts an ordinary https URL', () => {
    expect(webhookUrlProblem('https://example.ch/hooks/formancy')).toBeUndefined()
  })

  test('refuses anything that is not http or https', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.ch', 'gopher://example.ch']) {
      expect(webhookUrlProblem(url), url).toBeDefined()
    }
  })

  test('refuses plain http by default, because a signature over a cleartext body is theatre', () => {
    expect(webhookUrlProblem('http://example.ch/hook')).toBeDefined()
    expect(webhookUrlProblem('http://example.ch/hook', { allowHttp: true })).toBeUndefined()
  })

  test('refuses a literal private address without waiting for DNS', () => {
    // Cheap and early. The resolved-address check still has to happen, because
    // a hostname can point anywhere.
    expect(webhookUrlProblem('https://127.0.0.1/hook')).toBeDefined()
    expect(webhookUrlProblem('https://169.254.169.254/latest/meta-data/')).toBeDefined()
    expect(webhookUrlProblem('https://[::1]/hook')).toBeDefined()
  })

  test('refuses credentials in the URL', () => {
    // They would be sent to whatever the host turns out to be, and they end up
    // in logs.
    expect(webhookUrlProblem('https://user:pass@example.ch/hook')).toBeDefined()
  })

  test('refuses garbage rather than throwing', () => {
    expect(webhookUrlProblem('not a url')).toBeDefined()
    expect(webhookUrlProblem('')).toBeDefined()
  })
})


describe('hostnames', () => {
  test('are accepted at save time and judged after they resolve', () => {
    // A hostname cannot be classified until DNS answers, and refusing every
    // one would make the feature useless. The resolved address is checked at
    // delivery time instead.
    expect(webhookUrlProblem('https://internal.corp/hook')).toBeUndefined()
  })
})
