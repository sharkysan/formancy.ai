import type { Storage } from './ports.js'

/**
 * The management plane's identity and authorization, framework-free.
 *
 * Hashing and randomness are injected — this package cannot reach a CSPRNG or
 * argon2 on its own, the composition root hands them in — which keeps every
 * behaviour here testable with deterministic fakes while the real server gets
 * real cryptography.
 */
export type Role = 'admin' | 'editor' | 'viewer'

export interface Actor {
  kind: 'user' | 'apiKey'
  id: string
  role: Role
}

export interface AuthDeps {
  storage: Storage
  newId(): string
  nowIso(): string
  /** At least 160 bits of entropy, URL-safe. Injected, never Math.random. */
  randomToken(): string
  hashSecret(secret: string): Promise<string>
  verifySecret(secret: string, hash: string): Promise<boolean>
}

const MIN_PASSWORD_LENGTH = 10

export type CreateUserOutcome =
  | { ok: true; id: string }
  | { ok: false; message: string }

export async function createLocalUser(
  deps: AuthDeps,
  input: { email: string; password: string; role: Role },
): Promise<CreateUserOutcome> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `A password needs at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if ((await deps.storage.getUserByEmail(input.email)) !== undefined) {
    return { ok: false, message: 'That email is already in use.' }
  }

  const id = deps.newId()
  await deps.storage.insertUser({
    id,
    email: input.email,
    passwordHash: await deps.hashSecret(input.password),
    role: input.role,
    createdAt: deps.nowIso(),
  })
  return { ok: true, id }
}

export type AuthOutcome = { ok: true; actor: Actor } | { ok: false }

/**
 * A wrong password and an unknown email answer identically, and BOTH run a
 * hash verification — the difference in shape or timing would be a
 * user-enumeration oracle.
 */
export async function authenticateLocal(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<AuthOutcome> {
  const user = await deps.storage.getUserByEmail(input.email)
  const hash = user?.passwordHash ?? (await deps.hashSecret(`decoy:${deps.newId()}`))
  const verified = await deps.verifySecret(input.password, hash)
  if (user === undefined || !verified) return { ok: false }
  return { ok: true, actor: { kind: 'user', id: user.id, role: user.role } }
}

/** The visible prefix of an API key: enough to index and to name in a UI
 *  ("fmc_tok_a2c…"), never enough to authenticate. */
const KEY_PREFIX_LENGTH = 12

export type CreateApiKeyOutcome =
  | { ok: true; id: string; secret: string }
  | { ok: false; message: string }

export async function createApiKey(
  deps: AuthDeps,
  input: { name: string; role: Role },
): Promise<CreateApiKeyOutcome> {
  if (input.name.trim() === '') return { ok: false, message: 'An API key needs a name.' }

  // The secret exists in full exactly once — in this return value. Storage
  // holds the prefix (for lookup and display) and a hash (for verification).
  const secret = `fmc_${deps.randomToken()}`
  const id = deps.newId()
  await deps.storage.insertApiKey({
    id,
    name: input.name,
    prefix: secret.slice(0, KEY_PREFIX_LENGTH),
    secretHash: await deps.hashSecret(secret),
    role: input.role,
    createdAt: deps.nowIso(),
    revokedAt: null,
  })
  return { ok: true, id, secret }
}

export async function authenticateApiKey(deps: AuthDeps, presented: string): Promise<AuthOutcome> {
  const candidates = await deps.storage.findApiKeysByPrefix(presented.slice(0, KEY_PREFIX_LENGTH))
  for (const candidate of candidates) {
    if (candidate.revokedAt !== null) continue
    if (await deps.verifySecret(presented, candidate.secretHash)) {
      return { ok: true, actor: { kind: 'apiKey', id: candidate.id, role: candidate.role } }
    }
  }
  return { ok: false }
}

/**
 * The whole authorization model, in one table a reviewer can read top to
 * bottom. Deliberately NOT Postgres RLS in this phase: RLS couples the app to
 * per-request database roles and hides authorization from the test suite.
 * An unknown action is denied — permissions are granted by presence, never by
 * omission.
 */
export type Action =
  | 'form.read'
  | 'form.publish'
  | 'submission.read'
  | 'submission.export'
  | 'draft.write'
  | 'user.create'
  | 'apiKey.create'

const VIEWER_ACTIONS: readonly Action[] = ['form.read', 'submission.read']
const EDITOR_ACTIONS: readonly Action[] = [
  ...VIEWER_ACTIONS,
  'form.publish',
  'submission.export',
  'draft.write',
]
const ADMIN_ACTIONS: readonly Action[] = [...EDITOR_ACTIONS, 'user.create', 'apiKey.create']

const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  viewer: new Set(VIEWER_ACTIONS),
  editor: new Set(EDITOR_ACTIONS),
  admin: new Set(ADMIN_ACTIONS),
}

export function can(actor: Actor, action: Action): boolean {
  return PERMISSIONS[actor.role].has(action)
}
