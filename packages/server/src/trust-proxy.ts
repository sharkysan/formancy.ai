import { isIP } from 'node:net'

const WHAT_TO_WRITE =
  'Write the address of the reverse proxy in front of this server, e.g. 10.0.0.2, or a ' +
  'comma-separated list of addresses and CIDR ranges, e.g. 10.0.0.2,172.18.0.0/16 — or ' +
  'leave it unset to trust no proxy.'

/**
 * The proxies whose `X-Forwarded-For` this server believes, read from
 * `FORMANCY_TRUST_PROXY`.
 *
 * Every limit on the public plane counts the client's address. Behind a reverse
 * proxy the socket's address is the proxy's, so trusting nothing gives every
 * respondent one shared budget; trusting the wrong thing lets a client write its
 * own `X-Forwarded-For` and choose a fresh budget per request. So the setting
 * names the proxies, and only addresses and ranges:
 *
 * - **No hop count.** Fastify's option takes a number, and the Fastify this
 *   server depends on treats one as "trust nothing", because a count cannot
 *   tell the proxy from a client that connects directly. Accepting it here
 *   would be a setting that reads as configured and does nothing;
 *   `trust-proxy.test.ts` checks that Fastify still ignores one.
 * - **No `true`,** which Fastify also takes, and which believes anybody.
 * - **No names,** such as `uniquelocal`, which Fastify's `proxy-addr` expands
 *   into ranges nobody reading the setting can see — that one is every private
 *   address, a Docker network's gateway with it, and the gateway is where
 *   Docker hands published-port connections over from. Refused by the address
 *   check below, as a hostname is.
 *
 * Decision 0156 has the reasoning, and what was measured against Docker.
 *
 * Absent or empty returns undefined, which trusts nothing — the behaviour before
 * this setting existed, and the right one with no proxy in front. Anything else
 * that is not an address or a range is refused here, with a sentence saying what
 * to write, rather than left to Fastify's parser, whose TypeError names neither
 * the variable nor the fix.
 */
export function trustProxyFrom(value: string | undefined): string[] | undefined {
  if (value === undefined || value.trim() === '') return undefined

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    throw new Error(
      `FORMANCY_TRUST_PROXY is "${trimmed}", a hop count, which Fastify ignores: a count cannot tell ` +
        `the proxy from a client that connects directly. ${WHAT_TO_WRITE}`,
    )
  }
  if (trimmed.toLowerCase() === 'true') {
    throw new Error(
      'FORMANCY_TRUST_PROXY is "true", which would believe X-Forwarded-For from anybody and let ' +
        `every client choose the address its rate limits count. ${WHAT_TO_WRITE}`,
    )
  }

  const entries = trimmed.split(',').map((entry) => entry.trim())
  for (const entry of entries) {
    if (!isAddressOrRange(entry)) {
      throw new Error(
        `FORMANCY_TRUST_PROXY has "${entry}", which is not an IP address or a CIDR range. ${WHAT_TO_WRITE}`,
      )
    }
  }
  return entries
}

/**
 * An address, or an address with a prefix length its family allows.
 *
 * A zero prefix is refused, as Fastify's parser refuses it: `/0` is every
 * address, which is `true` spelled differently. A netmask after the slash is
 * refused too, though Fastify reads one — a second spelling of the same thing
 * is a second thing to get wrong, and a prefix length says it.
 */
function isAddressOrRange(entry: string): boolean {
  const slash = entry.indexOf('/')
  if (slash === -1) return isIP(entry) !== 0

  const family = isIP(entry.slice(0, slash))
  const prefix = entry.slice(slash + 1)
  if (family === 0 || !/^\d{1,3}$/.test(prefix)) return false
  const bits = Number(prefix)
  return bits >= 1 && bits <= (family === 4 ? 32 : 128)
}
