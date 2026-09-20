import { randomBytes } from 'node:crypto'
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import { SignJWT, jwtVerify } from 'jose'
import type { Actor, Role } from '@formancy/server-core'

/**
 * The real cryptography, confined to the composition root: argon2id for
 * secrets at rest, an HMAC-signed short-lived access token for sessions, and
 * a CSPRNG for API keys. server-core never sees any of this — it is handed
 * hash/verify/random functions and stays deterministic under test.
 *
 * HS256 rather than EdDSA for the session token, deliberately for this phase:
 * one secret in one env var is the self-hosting story a single-container
 * deployment can operate, and the signing scheme is an implementation detail
 * of a token that lives fifteen minutes. Revisit with key rotation.
 */
export function realSecretHashing(): {
  hashSecret(secret: string): Promise<string>
  verifySecret(secret: string, hash: string): Promise<boolean>
} {
  return {
    hashSecret: (secret) => argon2Hash(secret),
    verifySecret: async (secret, digest) => {
      try {
        return await argon2Verify(digest, secret)
      } catch {
        // A malformed digest is a failed verification, not a crash: this runs
        // on the login path with attacker-influenced timing.
        return false
      }
    },
  }
}

export function realRandomToken(): string {
  return randomBytes(30).toString('base64url')
}

const TOKEN_LIFETIME = '15m'

export interface SessionTokens {
  issue(actor: Actor): Promise<string>
  verify(token: string): Promise<Actor | undefined>
}

export function createSessionTokens(secret: string): SessionTokens {
  if (secret.length < 32) {
    throw new Error(
      'FORMANCY_AUTH_SECRET must be at least 32 characters. Generate one: openssl rand -base64 33',
    )
  }
  const key = new TextEncoder().encode(secret)

  return {
    async issue(actor) {
      return new SignJWT({ role: actor.role, kind: actor.kind })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(actor.id)
        .setIssuedAt()
        .setExpirationTime(TOKEN_LIFETIME)
        .sign(key)
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
        const role = payload['role']
        const kind = payload['kind']
        if (
          typeof payload.sub !== 'string' ||
          (role !== 'admin' && role !== 'editor' && role !== 'viewer') ||
          (kind !== 'user' && kind !== 'apiKey')
        ) {
          return undefined
        }
        return { id: payload.sub, role: role as Role, kind }
      } catch {
        return undefined
      }
    },
  }
}
