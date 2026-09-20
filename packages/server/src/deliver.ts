import { lookup as dnsLookup } from 'node:dns/promises'
// fetch from undici, NOT the global one. Node's global fetch is undici too,
// but a DIFFERENT instance, and handing it an Agent from this one fails at
// connect time with "invalid onRequestStart method" — a mismatch no unit test
// reaches, because none of them get as far as opening a socket.
import { Agent, fetch as undiciFetch } from 'undici'
import { deliveryHeaders, isPrivateAddress } from '@formancy/server-core'
import { webhookUrlProblem } from './webhook-url.js'

/**
 * Delivering one webhook, without letting the server be pointed at itself.
 *
 * The hard part is not checking the address. It is making sure the address
 * that was checked is the address that gets connected to.
 *
 * "Validate the URL, then fetch it" is defeated by DNS rebinding: the name
 * resolves to a public address while we check, and to 169.254.169.254 a
 * moment later when fetch resolves it again. The two lookups are independent,
 * and an attacker only has to win the second one. So this resolves the name
 * itself, checks every address that comes back, and then connects to a
 * checked address — while still sending the original Host header and SNI, so
 * TLS and virtual hosting keep working.
 *
 * That difference is the whole feature. Everything else here is hygiene.
 */

export interface DeliveryResult {
  ok: boolean
  status?: number
  /** Why it failed, for the admin's action log. Never the response body. */
  error?: string
}

export interface DeliveryOptions {
  /** Hard ceiling on the whole attempt, including connect and read. */
  timeoutMs?: number
  /** Plain http, for a sidecar on the same host. Off by default. */
  allowHttp?: boolean
  /**
   * Deliver to a private address. Off by default — see webhook-url.ts. This
   * gives up the confused-deputy protection, so it is opt-in per deployment
   * and never per form.
   */
  allowPrivateAddresses?: boolean
  /** Swappable so tests do not depend on the network. */
  resolve?: (hostname: string) => Promise<string[]>
}

const RESPONSE_CAP_BYTES = 64 * 1024

async function resolveAll(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

export async function deliver(
  input: {
    url: string
    body: string
    secret: string
    eventId: string
    attempt: number
    nowSeconds: number
  },
  options: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const problem = webhookUrlProblem(input.url, {
    allowHttp: options.allowHttp ?? false,
    allowPrivateAddresses: options.allowPrivateAddresses ?? false,
  })
  if (problem !== undefined) return { ok: false, error: problem }

  const url = new URL(input.url)
  const resolve = options.resolve ?? resolveAll

  let addresses: string[]
  try {
    addresses = await resolve(url.hostname)
  } catch (error) {
    return { ok: false, error: `Could not resolve ${url.hostname}: ${String(error)}` }
  }

  if (addresses.length === 0) return { ok: false, error: `${url.hostname} resolved to nothing.` }

  // EVERY address, not the first. A name that returns one public and one
  // private address is the rebinding attack spelled out, and picking the
  // public one to validate while the stack might use either is no check at all.
  const forbidden = options.allowPrivateAddresses === true
    ? undefined
    : addresses.find((address) => isPrivateAddress(address))
  if (forbidden !== undefined) {
    return { ok: false, error: `${url.hostname} resolves to ${forbidden}, which is not reachable from here.` }
  }

  const pinned = addresses[0]!

  // The agent connects to the address we checked and nothing else. The
  // original hostname stays in the Host header and in SNI, so TLS validates
  // against the certificate the site actually has.
  const family = pinned.includes(':') ? 6 : 4
  const agent = new Agent({
    connect: {
      // undici calls this with `all: true` and then expects an ARRAY of
      // { address, family }; the plain `(err, address, family)` form that
      // node:net uses comes back as "Invalid IP address: undefined". Both
      // shapes are handled because which one arrives depends on undici's
      // internals, and getting it wrong fails only at connect time — where no
      // unit test looks.
      lookup: (_hostname, opts: { all?: boolean | undefined }, callback: (...args: never[]) => void) => {
        const done = callback as unknown as (
          error: Error | null,
          result: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void
        if (opts.all === true) done(null, [{ address: pinned, family }])
        else done(null, pinned, family)
      },
    },
  })

  try {
    const response = await undiciFetch(url, {
      method: 'POST',
      headers: deliveryHeaders({
        eventId: input.eventId,
        secret: input.secret,
        body: input.body,
        timestampSeconds: input.nowSeconds,
        attempt: input.attempt,
      }),
      body: input.body,
      // A redirect is a second destination that nothing has checked. Following
      // one would hand an attacker the whole guard back.
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      dispatcher: agent,
    })

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, status: response.status, error: 'Redirects are not followed.' }
    }

    // Read a bounded amount and never interpret it. A receiver's body is not
    // ours to parse, and an unbounded read is a memory exhaustion the receiver
    // controls.
    await drain(response, RESPONSE_CAP_BYTES)

    return response.ok
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: `Receiver answered ${String(response.status)}.` }
  } catch (error) {
    // `fetch failed` on its own tells an operator nothing. The cause carries
    // the refused connection, the TLS failure or the timeout.
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
    return { ok: false, error: `${error instanceof Error ? error.message : String(error)}${cause}` }
  } finally {
    await agent.close()
  }
}

/** Consume at most `cap` bytes so the connection can be reused, then stop. */
async function drain(response: { body?: unknown }, cap: number): Promise<void> {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined
  const reader = body?.getReader()
  if (reader === undefined) return

  let read = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      read += value?.byteLength ?? 0
      if (read >= cap) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
