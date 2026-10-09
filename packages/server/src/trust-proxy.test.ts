import Fastify from 'fastify'
import { describe, expect, test } from 'vitest'
import { trustProxyFrom } from './trust-proxy.js'

/**
 * Reading `FORMANCY_TRUST_PROXY`.
 *
 * Which hops may say who the client is decides whose budget every public rate
 * limit spends, so a value that is not quite right has to stop the server rather
 * than start one that believes the wrong thing. The two ways to get it wrong are
 * not symmetrical: trusting too little is the defect this setting exists to fix,
 * and trusting too much lets every client choose its own address.
 */
describe('FORMANCY_TRUST_PROXY', () => {
  test('unset or empty trusts nothing, which is the behaviour before the setting existed', () => {
    // The compose files pass it through as a bare key, so unset arrives as
    // absent — and a `FORMANCY_TRUST_PROXY=` line left in `.env` arrives as the
    // empty string, which must not stop a server that never wanted a proxy.
    expect(trustProxyFrom(undefined)).toBeUndefined()
    expect(trustProxyFrom('')).toBeUndefined()
    expect(trustProxyFrom('   ')).toBeUndefined()
  })

  test('is one address, or a list of addresses and CIDR ranges in either family', () => {
    // A compose network hands the proxy a different address on each restart, so
    // a range is the ordinary case rather than an exotic one; the spaces are
    // what a person types after a comma.
    expect(trustProxyFrom('10.0.0.2')).toEqual(['10.0.0.2'])
    expect(trustProxyFrom('10.0.0.2, 172.18.0.0/16,::1 , fd00::/8')).toEqual([
      '10.0.0.2',
      '172.18.0.0/16',
      '::1',
      'fd00::/8',
    ])
  })

  test('accepts nothing Fastify would then refuse to start with', () => {
    // A value this module passes and Fastify's own parser rejects would still
    // stop the server, with a TypeError that names neither the variable nor what
    // to write. Every accepted shape is built here, and so is one the parser
    // refuses — without that, a Fastify that accepted everything would make this
    // test pass for the wrong reason.
    for (const value of ['10.0.0.2', '172.18.0.0/16', '::1', 'fd00::/8', '10.0.0.2,172.18.0.0/16']) {
      const accepted = trustProxyFrom(value) ?? []
      expect(accepted.length).toBeGreaterThan(0)
      expect(() => Fastify({ trustProxy: accepted })).not.toThrow()
    }
    expect(() => Fastify({ trustProxy: ['10.0.0.0/0'] })).toThrow()
  })

  test.each([
    ['a hostname', 'proxy.internal', 'proxy.internal'],
    ['an octet out of range', '10.0.0.256', '10.0.0.256'],
    ['an IPv4 prefix past 32', '10.0.0.0/33', '10.0.0.0/33'],
    ['an IPv6 prefix past 128', 'fd00::/129', 'fd00::/129'],
    ['a zero prefix, which is everybody', '10.0.0.2,0.0.0.0/0', '0.0.0.0/0'],
    ['a netmask where a prefix length goes', '10.0.0.0/255.0.0.0', '10.0.0.0/255.0.0.0'],
    ['a name for a range rather than the range', 'loopback', 'loopback'],
    ['an empty entry after a comma', '10.0.0.2,', ''],
    ['two addresses without a comma', '10.0.0.2 10.0.0.3', '10.0.0.2 10.0.0.3'],
  ])('refuses %s, naming the variable and the entry it could not read', (_case, value, entry) => {
    // Each of these is a deployment that believed it had named its proxy. Some
    // Fastify would refuse with a message about neither; the rest it would read
    // as something else. The entry is in the message so that a list of five
    // says which one.
    expect(() => trustProxyFrom(value)).toThrow('FORMANCY_TRUST_PROXY')
    expect(() => trustProxyFrom(value)).toThrow(`"${entry}"`)
  })

  test('refuses true, which would believe a forwarded address from anybody', () => {
    // Fastify accepts `true`. Here it would mean any client that writes its own
    // X-Forwarded-For chooses the address every public limit counts. What is held
    // is the refusal; the sentence it comes with, which says why, is for the
    // operator reading it.
    expect(() => trustProxyFrom('true')).toThrow('FORMANCY_TRUST_PROXY')
    expect(() => trustProxyFrom('TRUE')).toThrow('FORMANCY_TRUST_PROXY')
  })

  test.each(['1', '2'])('refuses a hop count (%s)', (value) => {
    // Fastify's own option takes one, and would ignore it: see below. Refused
    // rather than quietly turned into "trust nothing", which is what a deployment
    // that wrote it did not mean.
    expect(() => trustProxyFrom(value)).toThrow('FORMANCY_TRUST_PROXY')
  })

  test('refuses a hop count because Fastify ignores one', async () => {
    // The reason for the refusal above, checked against the dependency rather
    // than taken on trust: Fastify 5.12 treats a number as "trust nothing",
    // because a count cannot tell the proxy from a client that connects
    // directly. Accepting a hop count would be a setting that reads as
    // configured and does nothing. If a Fastify release honours one again this
    // fails, and the refusal is worth revisiting. Its types already refuse a
    // number; its runtime still takes one, which is what a value read from the
    // environment would meet.
    // @ts-expect-error -- the number Fastify's types no longer admit, on purpose
    const app = Fastify({ trustProxy: 1 })
    app.get('/ip', (request) => ({ ip: request.ip }))
    try {
      const response = await app.inject({
        url: '/ip',
        remoteAddress: '10.0.0.2',
        headers: { 'x-forwarded-for': '203.0.113.1' },
      })
      expect(response.json()).toEqual({ ip: '10.0.0.2' })
    } finally {
      await app.close()
    }
  })
})
