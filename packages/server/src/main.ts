import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { createApp } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'

// recheck ships a 23 MB JVM jar and a native binary per platform as OPTIONAL
// dependencies and falls back to a pure-JavaScript engine without them. For
// one static analysis at publish time, the jar is a large thing to carry in a
// self-hosted container and the per-platform binaries are an awkward thing to
// pin in an SBOM. Choosing the pure engine explicitly also makes the verdict
// deterministic rather than dependent on what happened to install.
process.env['RECHECK_BACKEND'] ??= 'pure'

/**
 * The runnable server: `node dist/main.mjs` with DATABASE_URL set, or
 * `docker compose up` from the repo root, which supplies both.
 *
 * Bootstraps its own tables on start — a self-hosted skeleton that works five
 * minutes after `git clone` is the adoption funnel; migrations arrive with the
 * lifecycle work.
 */
const databaseUrl = process.env['DATABASE_URL']
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('DATABASE_URL is required, e.g. postgres://formancy:formancy@localhost:5432/formancy')
  process.exit(1)
}

const port = Number(process.env['PORT'] ?? 4380)
const sql = postgres(databaseUrl)

let authSecret = process.env['FORMANCY_AUTH_SECRET']
if (authSecret === undefined || authSecret === '') {
  // A generated secret keeps `docker compose up` working, at the cost of every
  // session dying on restart. Say so loudly rather than failing dev cold.
  authSecret = randomBytes(33).toString('base64url')
  console.warn(
    'FORMANCY_AUTH_SECRET is not set: generated an ephemeral one, sessions will not survive a restart.',
  )
}

const adminEmail = process.env['FORMANCY_ADMIN_EMAIL']
const adminPassword = process.env['FORMANCY_ADMIN_PASSWORD']

await bootstrapSchema(sql)
const app = await createApp(createPostgresStorage(sql), {
  authSecret,
  ...(adminEmail !== undefined && adminPassword !== undefined
    ? { bootstrapAdmin: { email: adminEmail, password: adminPassword } }
    : {}),
})

await app.listen({ port, host: process.env['HOST'] ?? '0.0.0.0' })
console.log(`formancy server listening on :${port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => sql.end())
      .then(() => process.exit(0))
  })
}
