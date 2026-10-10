import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { createApp } from './app.js'
import { bootstrapSchema } from './db.js'
import { createPostgresStorage } from './postgres-storage.js'
import { createPostgresRateLimitStore } from './postgres-rate-limits.js'
import { startOutboxWorker } from './outbox-worker.js'
import { startFileCollector } from './file-collector.js'
import { startChallengeSweeper } from './challenge-sweeper.js'
import { createLocalFileStore } from './file-store.js'
import type { FileStore } from './file-store.js'
import { createS3FileStore } from './s3-file-store.js'
import { fileStoreSettings } from './file-store-settings.js'
import { CLAMD_DEFAULT_MAX_BYTES, createClamdScanner } from './clamd-scanner.js'
import { maxFileBytesFrom } from './upload-settings.js'
import { trustProxyFrom } from './trust-proxy.js'
import { modelSettings } from './model-settings.js'
import { createCompleter } from './completers.js'
import { logLevelFrom } from './log-settings.js'
import { createServerLog, databaseNotices } from './server-log.js'

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

/**
 * The server's log, on standard output: a JSON line per request and per error, each built
 * from a list of fields, so no body, header, query string, answer or credential has anywhere
 * to go (0168). `info` unless `FORMANCY_LOG_LEVEL` says otherwise; `off` keeps none, and a
 * level the server does not have stops it here. Read first, so the database's notices on the
 * first connection go through it too rather than being printed whole by the driver, and so
 * does the rate limits' counter, which is made before the app whose log it would otherwise use.
 */
const logLevel = logLevelFrom(process.env)
const log = logLevel === 'off' ? undefined : createServerLog(process.stdout, logLevel)
const sql = postgres(databaseUrl, { onnotice: databaseNotices(log) })

let authSecret = process.env['FORMANCY_AUTH_SECRET']
if (authSecret === undefined || authSecret === '') {
  // A generated secret keeps `docker compose up` working, at the cost of every
  // session, every draft's key and every token a form was handed out with dying
  // on restart (0062, 0169). Say so loudly rather than failing dev cold.
  authSecret = randomBytes(33).toString('base64url')
  console.warn(
    // "sessions will not survive a restart" is the phrase CI's container job looks for:
    // the warning is the contract an operator who never reads the docs still meets.
    'FORMANCY_AUTH_SECRET is not set: generated an ephemeral one, so sessions will not survive a restart, nor will drafts or forms being filled in.',
  )
}

const adminEmail = process.env['FORMANCY_ADMIN_EMAIL']
const adminPassword = process.env['FORMANCY_ADMIN_PASSWORD']

/** Where uploaded bytes go: the rules are in `fileStoreSettings`, which throws. */
const storeSettings = fileStoreSettings(process.env)
const fileStore: FileStore | undefined =
  storeSettings.kind === 's3'
    ? createS3FileStore(storeSettings.config)
    : storeSettings.kind === 'local'
      ? createLocalFileStore(storeSettings.directory)
      : undefined

// A whole number of bytes no larger than `files.size` holds, or the server does not start.
const maxFileBytes = maxFileBytesFrom(process.env)

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

/**
 * The reverse proxies whose X-Forwarded-For names the client. Unset trusts none,
 * which is right with nothing in front and wrong behind a proxy: every
 * respondent would share its one rate-limit budget. Refused at startup when it
 * is not addresses and ranges, since a server that started anyway would count
 * the wrong client and nothing would say so.
 */
const trustProxy = trustProxyFrom(process.env['FORMANCY_TRUST_PROXY'])

/**
 * The model the builders ask through this server, with its key kept here rather than in a
 * browser (0165). Unset is a supported state and the default: no model, no prompt pane in
 * the admin, and no form sent anywhere. Half a configuration — a key with no provider, a
 * provider with no model — is refused here, because a server that started anyway would
 * have no model while the operator believed it had one. The key is never logged.
 */
const modelChoice = modelSettings(process.env)
const model =
  modelChoice.kind === 'none'
    ? undefined
    : { provider: modelChoice.provider, model: modelChoice.model, completer: createCompleter(modelChoice) }

await bootstrapSchema(sql)
const storage = createPostgresStorage(sql)
// Every limit counts in the database, so behind any number of replicas it is the limit it says
// rather than that many times it; on connections of its own, so a counter that cannot answer
// holds none of the ones storage queries on. No setting turns it off (0170). It says in the log
// when it stops answering and when it answers again, and nothing when the log is off.
const rateLimits = createPostgresRateLimitStore(databaseUrl, log === undefined ? {} : { log })
const app = await createApp(storage, {
  authSecret,
  rateLimitStore: rateLimits.store,
  ...(adminEmail !== undefined && adminPassword !== undefined
    ? { bootstrapAdmin: { email: adminEmail, password: adminPassword } }
    : {}),
  ...(fileStore === undefined ? {} : { fileStore }),
  ...(challengeSecret === undefined ? {} : { challengeSecret }),
  ...(scanner === undefined ? {} : { scanner }),
  ...(trustProxy === undefined ? {} : { trustProxy }),
  ...(model === undefined ? {} : { model }),
  ...(logLevel === 'off' ? {} : { log: { sink: process.stdout, level: logLevel } }),
  maxFileBytes,
})

// Queued deliveries are useless until something sends them. Each worker says a failed pass
// in the app's log, by the same rule, and says nothing when it is off.
const outbox = startOutboxWorker(storage, {
  log: app.log,
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
  fileStore === undefined ? undefined : startFileCollector(storage, fileStore, { log: app.log })

// Independent of the collector: a deployment can have public forms and no
// uploads, and that deployment still accumulates spent challenges.
const sweeper = challengeSecret === undefined ? undefined : startChallengeSweeper(storage, { log: app.log })

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
// Said once, at startup, so an operator reading the log knows where forms are sent.
console.log(model === undefined ? 'No model configured.' : `Builders ask ${model.provider}'s ${model.model}.`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => rateLimits.end())
      .then(() => sql.end())
      .then(() => process.exit(0))
  })
}
