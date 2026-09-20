/**
 * Deciding whether an address is somewhere this server may fetch from.
 *
 * A self-hosted formancy sits inside somebody's private network and webhook
 * URLs are written by whoever can edit a form, which makes the server a
 * confused deputy: it can reach the database, the metadata service and every
 * internal admin panel, and it will fetch whatever it is told to.
 *
 * This half is pure — given an address, is it private — so it lives here and is
 * tested exhaustively. The rest lives in @formancy/server, because it cannot be
 * pure: parsing a URL needs `URL`, and resolving a hostname then connecting to
 * the address that was checked, rather than re-resolving, needs Node's DNS and
 * a custom agent. This package has no @types/node by design, and hand-rolling
 * a URL parser for a security check is how such a check gets quietly wrong.
 * All three parts are necessary. Validating a URL and then handing it to fetch is defeated by DNS
 * rebinding — the name resolves to a public address for the check and a private
 * one for the request — and that is the difference between a mitigation and
 * theatre.
 */

/** Everything before the first dot, as four octets, or undefined. */
function ipv4Octets(address: string): [number, number, number, number] | undefined {
  const parts = address.split('.')
  if (parts.length !== 4) return undefined

  const octets = parts.map((part) => {
    // Reject '', '1e2', '0x7f', ' 1' and leading zeros that some parsers read
    // as octal. Only plain decimal counts.
    if (!/^\d{1,3}$/.test(part)) return Number.NaN
    return Number(part)
  })

  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return undefined
  return octets as [number, number, number, number]
}

/**
 * Whether this address is one the server must not be pointed at.
 *
 * Unparseable input counts as private. An address this cannot classify is one
 * it cannot vouch for, and the safe direction is refusing to fetch.
 */
export function isPrivateAddress(address: string): boolean {
  const trimmed = address.trim().toLowerCase()
  if (trimmed === '') return true

  // Strip a zone index (`fe80::1%eth0`) and brackets (`[::1]`).
  const bare = trimmed.replace(/^\[|\]$/g, '').split('%')[0] ?? ''

  // ::ffff:127.0.0.1 is loopback wearing a hat. Unwrap before classifying, or
  // every private range walks straight through the IPv6 branch.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare)
  if (mapped?.[1] !== undefined) return isPrivateAddress(mapped[1])

  const octets = ipv4Octets(bare)
  if (octets !== undefined) {
    const [a, b] = octets
    if (a === 0) return true // "this network" — 0.0.0.0 is a local wildcard
    if (a === 10) return true // RFC1918
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local, including 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
    if (a === 192 && b === 168) return true // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
    if (a === 192 && b === 0) return true // IETF protocol assignments / test nets
    if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
    if (a >= 224) return true // multicast and reserved, up to 255.255.255.255
    return false
  }

  if (bare.includes(':')) {
    if (bare === '::' || bare === '::1') return true
    // fc00::/7 unique-local, fe80::/10 link-local.
    if (/^f[cd]/.test(bare)) return true
    if (/^fe[89ab]/.test(bare)) return true
    if (/^ff/.test(bare)) return true // multicast
    return false
  }

  // Not an address at all — a hostname, or nonsense. The caller resolves
  // hostnames and checks what comes back; anything else fails closed.
  return true
}

/**
 * Whether this is a literal IP address rather than a hostname.
 *
 * The two need different treatment and conflating them breaks the check in
 * both directions: `isPrivateAddress` fails closed on anything it cannot
 * parse, which is correct for an address that came back from DNS and wrong for
 * `example.ch`, where it would refuse every hostname in the world.
 */
export function isIpLiteral(host: string): boolean {
  const bare = host.trim().replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true
  // Anything with a colon is IPv6; a hostname cannot contain one.
  return bare.includes(':')
}
