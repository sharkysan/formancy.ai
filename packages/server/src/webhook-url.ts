import { isIpLiteral, isPrivateAddress } from '@formancy/server-core'

/**
 * URL-level checks on a webhook destination.
 *
 * Here rather than in @formancy/server-core because it needs `URL`, and that
 * package deliberately has no DOM or Node types — see
 * docs/decisions/0008-layered-packages.md. Hand-rolling a URL parser to keep it
 * there would be the wrong trade: a security check built on an approximate
 * parser is the kind that is quietly wrong.
 *
 * The address classification it calls IS pure and lives there, tested
 * exhaustively.
 */

export interface WebhookUrlOptions {
  /**
   * Allow plain http. Off by default: a signature over a body anybody can read
   * and rewrite in flight is theatre. A deployment posting to a sidecar on the
   * same host may reasonably turn it on.
   */
  allowHttp?: boolean
}

/**
 * What is wrong with this webhook URL, or undefined when nothing is.
 *
 * Checked when the URL is saved, so an author finds out immediately rather
 * than through a delivery that silently never works.
 */
export function webhookUrlProblem(
  raw: string,
  options: WebhookUrlOptions = {},
): string | undefined {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'That is not a URL.'
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return `Only http and https can be delivered to, not ${url.protocol.replace(':', '')}.`
  }

  if (url.protocol === 'http:' && options.allowHttp !== true) {
    return 'Use https. A signature over a body that anyone can read and rewrite proves nothing.'
  }

  if (url.username !== '' || url.password !== '') {
    return 'Remove the credentials from the URL: they would be sent to whatever the host resolves to, and they end up in logs.'
  }

  // Only a LITERAL address can be judged here. A hostname is checked after
  // resolution, at delivery time, by the caller — and running the fail-closed
  // address check against one would refuse every hostname in the world.
  if (isIpLiteral(url.hostname) && isPrivateAddress(url.hostname)) {
    return `${url.hostname} is not an address this server may be pointed at.`
  }

  return undefined
}
