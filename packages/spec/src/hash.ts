import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { canonicalize } from './canonical.js'

/**
 * The content hash identifying a form version.
 *
 * A submission stores this alongside its `form_version_id` foreign key: the FK
 * gives joins and referential integrity, the hash gives tamper evidence and
 * detects hand-edited database rows.
 *
 * Uses @noble/hashes rather than `node:crypto` because the builder validates
 * and hashes schemas in the browser, and rather than Web Crypto because
 * `crypto.subtle` is async and this needs to be callable from pure functions.
 */
export function schemaHash(schema: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(schema))))
}
