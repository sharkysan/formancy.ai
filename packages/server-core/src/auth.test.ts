import { beforeEach, describe, expect, test } from 'vitest'
import { createMemoryStorage } from './testing/memory-storage.js'
import {
  authenticateApiKey,
  authenticateLocal,
  can,
  createApiKey,
  createLocalUser,
} from './auth.js'
import type { AuthDeps } from './auth.js'

function djb2(text: string): string {
  let hash = 5381
  for (const char of text) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0
  return hash.toString(16)
}

let deps: AuthDeps
beforeEach(() => {
  let counter = 0
  deps = {
    storage: createMemoryStorage(),
    newId: () => `id-${++counter}`,
    nowIso: () => '2026-09-20T12:00:00Z',
    // Deterministic "randomness" for tests; the composition root injects the
    // real CSPRNG. The fake hash must be ONE-WAY like the real thing, or the
    // "storage never contains the secret" assertions test nothing: djb2 is
    // plenty for a behaviour test.
    randomToken: () => 'tok_' + 'a'.repeat(40),
    hashSecret: async (secret) => 'h' + djb2(secret),
    verifySecret: async (secret, hash) => hash === 'h' + djb2(secret),
  }
})

describe('local users', () => {
  test('creating a user stores a HASH, never the password', async () => {
    const user = await createLocalUser(deps, {
      email: 'admin@b.ch',
      password: 'correct horse',
      role: 'admin',
    })

    expect(user.ok).toBe(true)
    const stored = await deps.storage.getUserByEmail('admin@b.ch')
    expect(stored).toBeDefined()
    expect(JSON.stringify(stored)).not.toContain('correct horse')
  })

  test('authenticates with the right password, refuses the wrong one, same-shaped answers', async () => {
    await createLocalUser(deps, { email: 'admin@b.ch', password: 'correct horse', role: 'admin' })

    const good = await authenticateLocal(deps, { email: 'admin@b.ch', password: 'correct horse' })
    const bad = await authenticateLocal(deps, { email: 'admin@b.ch', password: 'wrong' })
    const ghost = await authenticateLocal(deps, { email: 'ghost@b.ch', password: 'correct horse' })

    expect(good).toMatchObject({ ok: true, actor: { kind: 'user', role: 'admin' } })
    // A wrong password and an unknown email must be indistinguishable — the
    // difference is a user-enumeration oracle.
    expect(bad).toEqual({ ok: false })
    expect(ghost).toEqual({ ok: false })
  })

  test('a second user with the same email is refused', async () => {
    await createLocalUser(deps, { email: 'a@b.ch', password: 'x'.repeat(12), role: 'editor' })
    const second = await createLocalUser(deps, { email: 'a@b.ch', password: 'y'.repeat(12), role: 'viewer' })

    expect(second.ok).toBe(false)
  })
})

describe('api keys', () => {
  test('creation returns the secret ONCE; storage holds only prefix and hash', async () => {
    const created = await createApiKey(deps, { name: 'ci', role: 'editor' })

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.secret.startsWith('fmc_')).toBe(true)
    const rows = await deps.storage.listApiKeys()
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(created.secret)
    expect(created.secret.startsWith(rows[0]!.prefix)).toBe(true)
  })

  test('authenticates a presented key by prefix lookup plus hash verify', async () => {
    const created = await createApiKey(deps, { name: 'ci', role: 'editor' })
    if (!created.ok) throw new Error('create failed')

    const good = await authenticateApiKey(deps, created.secret)
    const bad = await authenticateApiKey(deps, 'fmc_' + 'z'.repeat(40))

    expect(good).toMatchObject({ ok: true, actor: { kind: 'apiKey', role: 'editor' } })
    expect(bad).toEqual({ ok: false })
  })

  test('a revoked key stops authenticating', async () => {
    const created = await createApiKey(deps, { name: 'ci', role: 'editor' })
    if (!created.ok) throw new Error('create failed')
    const rows = await deps.storage.listApiKeys()
    await deps.storage.revokeApiKey(rows[0]!.id, deps.nowIso())

    expect(await authenticateApiKey(deps, created.secret)).toEqual({ ok: false })
  })
})

describe('can()', () => {
  const admin = { kind: 'user', id: 'u1', role: 'admin' } as const
  const editor = { kind: 'user', id: 'u2', role: 'editor' } as const
  const viewer = { kind: 'user', id: 'u3', role: 'viewer' } as const

  test('the role table is legible: admin everything, editor writes forms, viewer reads', () => {
    expect(can(admin, 'form.publish')).toBe(true)
    expect(can(admin, 'user.create')).toBe(true)

    expect(can(editor, 'form.publish')).toBe(true)
    expect(can(editor, 'submission.read')).toBe(true)
    expect(can(editor, 'user.create')).toBe(false)

    expect(can(viewer, 'form.read')).toBe(true)
    expect(can(viewer, 'submission.read')).toBe(true)
    expect(can(viewer, 'form.publish')).toBe(false)
    expect(can(viewer, 'submission.export')).toBe(false)
  })

  test('an unknown action is denied, never allowed by omission', () => {
    expect(can(admin, 'starship.launch' as never)).toBe(false)
  })
})
