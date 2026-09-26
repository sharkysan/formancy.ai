import { createHash, createHmac } from 'node:crypto'

/**
 * AWS Signature Version 4, for the four requests an object store needs.
 *
 * ── WHY THIS IS HERE AND NOT A DEPENDENCY ───────────────────────────────────
 *
 * `@aws-sdk/client-s3` is the obvious answer and brings dozens of transitive
 * packages for PUT, GET, DELETE and HEAD against one bucket. Every one of them
 * is a row somebody has to characterise in `SOUP-DECLARATION.md`, and a
 * manufacturer incorporating this reads that table.
 *
 * `aws4fetch` is one MIT file with no dependencies and would have been fine. It
 * was last published in 2024 by a single maintainer, which is the same bus-factor
 * shape as `@marcbachmann/cel-js` -- and that one is handled by owning a facade
 * around it. Here the whole surface is smaller than the facade would be.
 *
 * So this is ours: sixty lines against a frozen specification, with the
 * algorithm's own vocabulary in the names so it can be read beside AWS's
 * description of it. It signs requests for **any** S3-compatible endpoint, which
 * is the point -- Garage is what the design calls for, and a customer pointing at
 * real S3 or Backblaze gets the same code path.
 *
 * ── WHAT VERIFIES IT ────────────────────────────────────────────────────────
 *
 * A real S3 implementation, in a container, refusing a wrong signature with a
 * 403. Unit tests pin the mechanical properties; they cannot tell whether the
 * canonical request is *right*, only that it is consistent with itself. See the
 * long comment in `sigv4.test.ts` for why there is no hard-coded vector.
 */

/** The SHA-256 of an empty body, which a GET or DELETE carries. */
export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export interface SignArgs {
  readonly method: 'GET' | 'PUT' | 'DELETE' | 'HEAD'
  readonly url: URL
  /** Headers to sign and send. `host` is required; casing does not matter. */
  readonly headers: Readonly<Record<string, string>>
  /** Hex SHA-256 of the body. S3 sends it as a header as well as signing it. */
  readonly payloadHash: string
  readonly service: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  /** Injected so a test is not a test of the clock. */
  readonly now: Date
}

/**
 * The headers to send, including `authorization`.
 *
 * Returns headers rather than mutating a request so that the caller's `fetch`
 * options stay the caller's business, and so the signature is inspectable in a
 * test without a server.
 */
export function signRequest(args: SignArgs): Record<string, string> {
  const { method, url, payloadHash, service, region, accessKeyId, secretAccessKey, now } = args

  // Lowercase every name once, here, so nothing below has to wonder. A header
  // signed under one casing and sent under another is a 403 with no clue in it.
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(args.headers)) {
    headers[name.toLowerCase()] = value
  }

  if (headers['host'] === undefined) {
    // AWS requires host in the signature. Failing here, where the message can
    // say so, beats a server rejecting it for a reason it will not explain.
    throw new Error('Refusing to sign a request with no host header.')
  }

  const amzDate = basicIso8601(now)
  const dateStamp = amzDate.slice(0, 8)

  headers['x-amz-date'] = amzDate
  // S3 requires this header and requires it to equal the hash in the canonical
  // request. Set from the same value rather than computed twice: two routes to
  // one number is how they come to disagree.
  headers['x-amz-content-sha256'] = payloadHash

  // Sorted by name, because "canonical" means both sides sort identically.
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names
    // Sequential spaces collapse and the value is trimmed, per the spec. A
    // header a proxy reformatted must still hash to the same bytes.
    .map((name) => `${name}:${(headers[name] ?? '').trim().replace(/\s+/g, ' ')}\n`)
    .join('')
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    method,
    canonicalPath(url, service),
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // The key is derived per date, region and service, so a leaked signing key is
  // useless tomorrow, elsewhere, or for another service. That is the whole
  // reason for the four-step chain rather than signing with the secret.
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, service)
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')

  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return headers
}

/**
 * `20150830T123600Z` — basic ISO 8601, not the extended form.
 *
 * `toISOString()` gives `2015-08-30T12:36:00.000Z`, which is rejected. Stripping
 * the punctuation is the whole conversion, and the credential scope then wants
 * the same instant as `20150830`, which is why this returns the long one and the
 * caller slices it.
 */
function basicIso8601(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, '').split('.')[0] ?? ''}Z`
}

/**
 * The path, encoded **once** for s3 and twice for everything else.
 *
 * This is the one place where s3 departs from the general rule, and getting it
 * wrong produces a signature that is valid for every other AWS service and
 * refused by the only one we call -- and refused only for keys containing a
 * character that needs encoding, which is the worst possible way to find out.
 */
function canonicalPath(url: URL, service: string): string {
  // `url.pathname` is already percent-encoded by URL parsing, which is exactly
  // the single encoding s3 wants.
  const once = url.pathname === '' ? '/' : url.pathname
  if (service === 's3') return once
  return once
    .split('/')
    .map((segment) => uriEncode(decodeURIComponent(segment)))
    .join('/')
}

/** Sorted by encoded name, values encoded, `=` even when empty. */
function canonicalQuery(url: URL): string {
  const pairs: Array<readonly [string, string]> = []
  for (const [name, value] of url.searchParams) pairs.push([uriEncode(name), uriEncode(value)])
  // Sorted after encoding, per the spec: sorting the raw names orders them
  // differently whenever an encoded byte changes the comparison.
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return pairs.map(([name, value]) => `${name}=${value}`).join('&')
}

/**
 * AWS's `UriEncode`, which is not `encodeURIComponent`.
 *
 * The differences are small and each one is a 403: `!`, `'`, `(`, `)` and `*`
 * are left alone by `encodeURIComponent` and must be encoded, hex digits must be
 * uppercase, and a space is `%20` rather than `+`.
 */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}
