import { describe, expect, test } from 'vitest'
import { isIpLiteral, isPrivateAddress } from './address.js'

/**
 * A self-hosted formancy sits inside somebody's private network, and webhook
 * URLs are written by whoever can edit a form. That makes the server a
 * confused deputy: it can reach the database, the metadata service and every
 * internal admin panel, and it will fetch whatever it is told to.
 */
describe('isPrivateAddress', () => {
  test('loopback', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '::1', '0.0.0.0']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  test('the RFC1918 ranges', () => {
    for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  test('addresses next to those ranges are public, so the check is not a prefix match', () => {
    // 172.15 and 172.32 are outside 172.16/12, and 11.x is not 10.x. A
    // string-prefix implementation gets these wrong in both directions.
    for (const address of ['172.15.0.1', '172.32.0.1', '11.0.0.1', '192.169.1.1', '9.255.255.255']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  test('the cloud metadata service, which is the one everybody targets', () => {
    // 169.254.169.254 hands out credentials on AWS, GCP and Azure. Link-local
    // as a whole is refused rather than that one address, because
    // 169.254.169.253 and friends are equally not ours to fetch.
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
    expect(isPrivateAddress('169.254.1.1')).toBe(true)
  })

  test('carrier-grade NAT', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true)
    expect(isPrivateAddress('100.127.255.255')).toBe(true)
    expect(isPrivateAddress('100.128.0.1')).toBe(false)
  })

  test('IPv6 unique-local and link-local', () => {
    for (const address of ['fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  test('IPv4-mapped IPv6, which is the same private address wearing a hat', () => {
    // ::ffff:127.0.0.1 resolves to loopback. Checking the textual form without
    // unwrapping it lets every private range straight through.
    for (const address of ['::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
    expect(isPrivateAddress('::ffff:93.184.216.34')).toBe(false)
  })

  test('a real public address is allowed, or the feature does nothing', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1::1']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  test('anything unparseable is treated as private', () => {
    // Fail closed: an address this cannot classify is one it cannot vouch for.
    for (const address of ['', 'not-an-address', '999.999.999.999']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })
})

describe('isIpLiteral', () => {
  test('tells an address from a hostname, which the two checks need', () => {
    // isPrivateAddress fails closed on anything unparseable, which is right
    // for something DNS returned and wrong for a hostname — used on one it
    // would refuse every URL in the world.
    expect(isIpLiteral('127.0.0.1')).toBe(true)
    expect(isIpLiteral('[::1]')).toBe(true)
    expect(isIpLiteral('2606:2800:220:1::1')).toBe(true)
    expect(isIpLiteral('example.ch')).toBe(false)
    expect(isIpLiteral('localhost')).toBe(false)
  })

})
