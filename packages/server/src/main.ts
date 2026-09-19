import postgres from 'postgres'
import { createApp } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'

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

await bootstrapSchema(sql)
const app = createApp(createPostgresStorage(sql))

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
