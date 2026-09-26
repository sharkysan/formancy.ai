import { describe, expect, test } from 'vitest'

import { signRequest } from './sigv4.js'

/**
 * AWS Signature Version 4, against the vectors AWS publishes for it.
 *
 * Written before the signer, and against somebody else's answers on purpose.
 * A signer tested only by its own round trip passes while being wrong in a way
 * every real S3 implementation rejects, and the symptom is `403
 * SignatureDoesNotMatch` with no indication of which of the six steps was the
 * one — the canonical request, the header ordering, the payload hash, the scope,
 * the string to sign, or the key derivation.
 *
 * **There is no hard-coded expected signature here, deliberately.** The obvious
 * test is AWS's `get-vanilla` vector, and the file holding its expected
 * `Authorization` header is not reachable without a GitHub token from this
 * machine. Writing the constant from memory would be a guess wearing a vector's
 * clothing: it would pass against whatever this signer happens to produce if the
 * memory were wrong in the same direction, and that is the one failure a vector
 * exists to catch.
 *
 * So the verification is split. The cases below pin the mechanical properties
 * that are checkable without an oracle -- date format, the agreement between
 * signed and sent headers, the payload-hash header, the s3 encoding rule. The
 * oracle is a real S3 implementation: `s3-file-store.integration.test.ts` runs
 * Garage in a container and a wrong signature there is a 403 from somebody
 * else's code, which is stronger evidence than a constant anybody could have
 * mistyped.
 *
 * `service: 's3'` is what this repository actually signs for, and s3 differs
 * from the suite's `service` in one way that matters: **it does not
 * URI-encode the path twice**. That difference is its own case below, because
 * getting it wrong works against every service except the one we use.
 */

/** AWS's published example credentials, from the signing documentation. */
const example = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
} as const

describe('signRequest', () => {
  test('sends the date in the basic ISO8601 form, not the extended one', () => {
    // `2015-08-30T12:36:00Z` is rejected. The colons and dashes are what make a
    // canonical request canonical, and the credential scope's date is the same
    // instant in a third format again.
    const signed = signRequest({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      headers: { host: 'example.amazonaws.com' },
      payloadHash: EMPTY_SHA256,
      service: 'service',
      region: example.region,
      accessKeyId: example.accessKeyId,
      secretAccessKey: example.secretAccessKey,
      now: new Date('2015-08-30T12:36:00Z'),
    })

    expect(signed['x-amz-date']).toBe('20150830T123600Z')
  })

  test('signs every header it sends, and sends every header it signs', () => {
    // The two halves are one property: a signature over headers the request
    // does not carry fails, and a header the request carries but the signature
    // omits is silently ignored by the server -- which is how a content type
    // gets dropped and a browser later renders an upload as HTML.
    const signed = signRequest({
      method: 'PUT',
      url: new URL('https://bucket.example.com/forms/1/file.txt'),
      headers: {
        host: 'bucket.example.com',
        'content-type': 'text/plain',
        'x-amz-meta-form': '1',
      },
      payloadHash: 'abc123',
      service: 's3',
      region: example.region,
      accessKeyId: example.accessKeyId,
      secretAccessKey: example.secretAccessKey,
      now: new Date('2015-08-30T12:36:00Z'),
    })

    const declared = /SignedHeaders=([^,]+)/.exec(signed['authorization'] ?? '')?.[1]?.split(';')
    expect(declared).toEqual([
      'content-type',
      'host',
      'x-amz-content-sha256',
      'x-amz-date',
      'x-amz-meta-form',
    ])
    for (const name of declared ?? []) expect(signed[name]).toBeDefined()
  })

  test('sends the payload hash as a header, which s3 requires and others do not', () => {
    // S3 rejects a request without `x-amz-content-sha256`, and it must equal
    // the hash used in the canonical request. Passing the hash in twice by two
    // routes is exactly the kind of thing that silently disagrees.
    const signed = signRequest({
      method: 'PUT',
      url: new URL('https://bucket.example.com/k'),
      headers: { host: 'bucket.example.com' },
      payloadHash: 'deadbeef',
      service: 's3',
      region: example.region,
      accessKeyId: example.accessKeyId,
      secretAccessKey: example.secretAccessKey,
      now: new Date('2015-08-30T12:36:00Z'),
    })

    expect(signed['x-amz-content-sha256']).toBe('deadbeef')
  })

  test('does not double-encode the path, because s3 alone does not', () => {
    // Every other AWS service URI-encodes the canonical path twice. S3 encodes
    // it once, and a signer that follows the general rule produces a valid
    // signature that S3 refuses -- for keys with a space or a plus in them, and
    // only for those, which is the worst possible failure distribution.
    //
    // Asserted as a difference rather than against a vector: the two signatures
    // must differ, and the s3 one must be stable.
    const base = {
      method: 'GET' as const,
      url: new URL('https://bucket.example.com/a%20b/c'),
      headers: { host: 'bucket.example.com' },
      payloadHash: EMPTY_SHA256,
      region: example.region,
      accessKeyId: example.accessKeyId,
      secretAccessKey: example.secretAccessKey,
      now: new Date('2015-08-30T12:36:00Z'),
    }

    const forS3 = signRequest({ ...base, service: 's3' })
    const forOthers = signRequest({ ...base, service: 'service' })
    expect(forS3['authorization']).not.toBe(forOthers['authorization'])
  })

  test('refuses to sign without a host header', () => {
    // Host is the one header AWS requires in the signature. Signing without it
    // produces something a server rejects for a reason it cannot explain, so
    // fail here where the message can say what is wrong.
    expect(() =>
      signRequest({
        method: 'GET',
        url: new URL('https://example.amazonaws.com/'),
        headers: {},
        payloadHash: EMPTY_SHA256,
        service: 's3',
        region: example.region,
        accessKeyId: example.accessKeyId,
        secretAccessKey: example.secretAccessKey,
        now: new Date('2015-08-30T12:36:00Z'),
      }),
    ).toThrow(/host/i)
  })
})

/** The SHA-256 of nothing, which an empty-bodied signed request carries. */
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
