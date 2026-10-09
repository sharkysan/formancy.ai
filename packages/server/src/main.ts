import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { createApp } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'
import { startOutboxWorker } from './outbox-worker.js'
import { startFileCollector } from './file-collector.js'
import { startChallengeSweeper } from './challenge-sweeper.js'
import { createLocalFileStore } from './file-store.js'
import type { FileStore } from './file-store.js'
import { createS3FileStore } from './s3-file-store.js'
import { CLAMD_DEFAULT_MAX_BYTES, createClamdScanner } from './clamd-scanner.js'

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

/**
 * Where uploaded bytes go.
 *
 * Absent means this deployment accepts no files, and that is a supported
 * state rather than a misconfiguration: a form with a file field still renders
 * and still submits, and the field says plainly that there is nowhere to put
 * one. Turning uploads on is naming a directory, which in a container is
 * naming a volume — and a volume is the one thing a self-hoster has to think
 * about, so it is not defaulted.
 */
const filesDirectory = process.env['FORMANCY_FILES_DIR']
const s3Endpoint = process.env['FORMANCY_S3_ENDPOINT']

if (filesDirectory !== undefined && s3Endpoint !== undefined) {
  // Two stores means half the files are in one and half in the other, and
  // nothing records which -- so a later reader gets "no such file" for bytes
  // that exist in the store it did not ask. Refusing at startup is the only
  // point at which this is cheap to fix.
  throw new Error(
    'Set FORMANCY_FILES_DIR or FORMANCY_S3_ENDPOINT, not both: two stores means ' +
      'files land in one and are looked for in the other.',
  )
}

/**
 * The object store, when one is configured.
 *
 * Every field is required once the endpoint is set, and none is defaulted. A
 * bucket name guessed wrong is a deployment that accepts uploads into nothing;
 * credentials guessed wrong are a deployment where every file reads as missing.
 * Both fail here instead.
 */
const s3Store = ((): FileStore | undefined => {
  if (s3Endpoint === undefined) return undefined

  const required = (name: string): string => {
    const value = process.env[name]
    if (value === undefined || value === '') {
      throw new Error(`${name} is required when FORMANCY_S3_ENDPOINT is set.`)
    }
    return value
  }

  return createS3FileStore({
    endpoint: s3Endpoint,
    bucket: required('FORMANCY_S3_BUCKET'),
    // Part of the credential scope, so a wrong region is a signature the store
    // computes differently and rejects. Garage answers to any name and real S3
    // does not, which is why there is no default.
    region: required('FORMANCY_S3_REGION'),
    accessKeyId: required('FORMANCY_S3_ACCESS_KEY_ID'),
    secretAccessKey: required('FORMANCY_S3_SECRET_ACCESS_KEY'),
  })
})()

const fileStore =
  s3Store ?? (filesDirectory === undefined ? undefined : createLocalFileStore(filesDirectory))

const maxFileBytes = Number(process.env['FORMANCY_MAX_FILE_BYTES'] ?? 10 * 1024 * 1024)
if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
  throw new Error('FORMANCY_MAX_FILE_BYTES must be a positive number of bytes.')
}

/**
 * A ClamAV daemon to ask about every upload before its bytes are kept.
 *
 * Unset is a supported state: no file is scanned, which the documentation says. Set, a
 * file is kept only once clamd has called it clean, and refused when clamd cannot be
 * reached — the point of configuring a scanner is that nothing unscanned gets in
 * ([0131](../../../docs/decisions/0131-an-upload-is-scanned-before-it-is-kept.md)).
 * Not checked at startup: clamd takes minutes to load its signatures, and a server that
 * refused to start until then would turn a slow scanner into an outage of everything.
 */
const clamdHost = process.env['FORMANCY_CLAMD_HOST']
const clamdPort = Number(process.env['FORMANCY_CLAMD_PORT'] ?? 3310)
const clamdMaxBytes = Number(process.env['FORMANCY_CLAMD_MAX_BYTES'] ?? CLAMD_DEFAULT_MAX_BYTES)
if (!Number.isInteger(clamdPort) || clamdPort <= 0 || clamdPort > 65_535) {
  throw new Error('FORMANCY_CLAMD_PORT must be a port number.')
}
if (!Number.isFinite(clamdMaxBytes) || clamdMaxBytes <= 0) {
  throw new Error("FORMANCY_CLAMD_MAX_BYTES must be a positive number of bytes: clamd's StreamMaxLength.")
}
const scanner =
  clamdHost === undefined || clamdHost === ''
    ? undefined
    : createClamdScanner({ host: clamdHost, port: clamdPort, maxBytes: clamdMaxBytes })

/**
 * Turns the proof-of-work challenge on for anonymous submissions.
 *
 * Unset is a supported state rather than a misconfiguration: a deployment
 * whose forms all require a session has no anonymous surface to protect, and
 * the challenge route says so with a 404 rather than failing. A deployment
 * with public forms should set it — the other layers are rate limits, an
 * origin allowlist and a body cap, all of which an attacker with a few
 * addresses walks past.
 *
 * Separate from FORMANCY_AUTH_SECRET so that rotating one does not invalidate
 * the other: rotating this one costs an unsolved puzzle, rotating that one
 * costs everybody their session.
 */
const challengeSecret = process.env['FORMANCY_CHALLENGE_SECRET']
if (challengeSecret !== undefined && challengeSecret.length < 32) {
  throw new Error('FORMANCY_CHALLENGE_SECRET must be at least 32 characters, or unset.')
}

await bootstrapSchema(sql)
const storage = createPostgresStorage(sql)
const app = await createApp(storage, {
  authSecret,
  ...(adminEmail !== undefined && adminPassword !== undefined
    ? { bootstrapAdmin: { email: adminEmail, password: adminPassword } }
    : {}),
  ...(fileStore === undefined ? {} : { fileStore }),
  ...(challengeSecret === undefined ? {} : { challengeSecret }),
  ...(scanner === undefined ? {} : { scanner }),
  maxFileBytes,
})

// Queued deliveries are useless until something sends them.
const outbox = startOutboxWorker(storage, {
  ...(process.env['FORMANCY_WEBHOOK_ALLOW_HTTP'] === 'true' ? { allowHttp: true } : {}),
  // Gives up the SSRF guard. For a sidecar receiver on a trusted network, and
  // for nothing else.
  ...(process.env['FORMANCY_WEBHOOK_ALLOW_PRIVATE'] === 'true'
    ? { allowPrivateAddresses: true }
    : {}),
})
// Somebody who attaches a file and closes the tab leaves bytes behind. A disk
// that fills up for a reason nobody is watching is the most tedious outage
// there is.
const collector =
  fileStore === undefined ? undefined : startFileCollector(storage, fileStore)

// Independent of the collector: a deployment can have public forms and no
// uploads, and that deployment still accumulates spent challenges.
const sweeper = challengeSecret === undefined ? undefined : startChallengeSweeper(storage)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    outbox.stop()
    collector?.stop()
    sweeper?.stop()
    void app.close().then(() => process.exit(0))
  })
}

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
