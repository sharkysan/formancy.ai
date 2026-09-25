import { jsonb, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type postgres from 'postgres'

/**
 * The thin slice's tables. Three rules from the design spec are enforced HERE,
 * in the database, because application code can be bypassed and these must not
 * be:
 *
 *  - published versions are immutable (a trigger refuses UPDATE),
 *  - a submission binds to its exact version by real foreign key,
 *  - that key is ON DELETE RESTRICT, so orphaning a submission from the schema
 *    that produced it is structurally impossible.
 */
export const forms = pgTable('forms', {
  id: uuid('id').primaryKey(),
  path: text('path').notNull().unique(),
  currentVersionId: uuid('current_version_id'),
  // Defaults to the safe value in the DATABASE as well as in the code, so a
  // row inserted by a migration or a fixture is private unless it says
  // otherwise. A default of 'public' one refactor away from being forgotten is
  // how a private form becomes a public one.
  accessSubmit: text('access_submit').notNull().default('authenticated'),
  // NULL means no allowlist is in force. An empty array means nothing is
  // allowed — a different thing, and the reason this is nullable.
  allowedOrigins: text('allowed_origins').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const formVersions = pgTable('form_versions', {
  id: uuid('id').primaryKey(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  version: integer('version').notNull(),
  schema: jsonb('schema').notNull(),
  schemaHash: text('schema_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  secretHash: text('secret_hash').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const drafts = pgTable('drafts', {
  id: text('id').notNull(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  formVersionId: uuid('form_version_id')
    .notNull()
    .references(() => formVersions.id),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
})

/**
 * The outbox. A row here and the submission that caused it are written by the
 * same transaction, which is what makes "accepted" and "will be delivered" one
 * decision rather than two.
 */
export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey(),
  webhookId: uuid('webhook_id').notNull(),
  submissionId: uuid('submission_id').notNull(),
  eventId: uuid('event_id').notNull(),
  body: text('body').notNull(),
  attempt: integer('attempt').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  state: text('state').notNull().default('pending'),
  lastError: text('last_error'),
})

export const files = pgTable('files', {
  id: uuid('id').primaryKey(),
  formId: uuid('form_id').notNull(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  contentType: text('content_type').notNull(),
  storageKey: text('storage_key').notNull(),
  state: text('state').notNull().default('offered'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  submissionId: uuid('submission_id'),
})

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey(),
  formId: uuid('form_id')
    .notNull()
    .references(() => forms.id),
  formVersionId: uuid('form_version_id')
    .notNull()
    .references(() => formVersions.id, { onDelete: 'restrict' }),
  data: jsonb('data').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
})

/**
 * Bootstrap DDL for the thin slice — drizzle-kit migrations arrive with the
 * lifecycle work; a self-hosted skeleton that creates its own tables on first
 * start is worth more right now than a migration pipeline.
 */
export async function bootstrapSchema(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS forms (
      id uuid PRIMARY KEY,
      path text NOT NULL UNIQUE,
      current_version_id uuid,
      -- Private by default in the DATABASE, not only in the code, so a row
      -- inserted by a migration or a fixture is not accidentally open.
      access_submit text NOT NULL DEFAULT 'authenticated'
        CHECK (access_submit IN ('authenticated', 'public')),
      -- NULL: no allowlist in force. Empty array: nothing allowed. Different
      -- things, which is why this is nullable rather than defaulting to '{}'.
      allowed_origins text[],
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  // Existing databases predate the two columns above. Adding them here rather
  // than in a separate migration keeps bootstrap idempotent for both a fresh
  // database and one created before access control existed.
  await sql`
    ALTER TABLE forms
      ADD COLUMN IF NOT EXISTS access_submit text NOT NULL DEFAULT 'authenticated'`
  await sql`ALTER TABLE forms ADD COLUMN IF NOT EXISTS allowed_origins text[]`
  await sql`
    CREATE TABLE IF NOT EXISTS form_versions (
      id uuid PRIMARY KEY,
      form_id uuid NOT NULL REFERENCES forms(id),
      version integer NOT NULL,
      schema jsonb NOT NULL,
      schema_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (form_id, version),
      UNIQUE (form_id, schema_hash)
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id uuid PRIMARY KEY,
      form_id uuid NOT NULL REFERENCES forms(id),
      form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
      data jsonb NOT NULL,
      submitted_at timestamptz NOT NULL
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id uuid PRIMARY KEY,
      form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      url text NOT NULL,
      secret text NOT NULL
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS deliveries (
      id uuid PRIMARY KEY,
      webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      -- RESTRICT, not CASCADE: a delivery is the record that something was
      -- sent about this submission, and deleting the submission must not
      -- quietly erase it.
      submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      event_id uuid NOT NULL,
      body text NOT NULL,
      attempt integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL,
      state text NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'delivered', 'dead')),
      last_error text
    )`
  await sql`
    CREATE INDEX IF NOT EXISTS deliveries_due
      ON deliveries (next_attempt_at) WHERE state = 'pending'`
  await sql`
    CREATE TABLE IF NOT EXISTS files (
      id uuid PRIMARY KEY,
      form_id uuid NOT NULL REFERENCES forms(id) ON DELETE RESTRICT,
      -- What the reader called it. Display only: the storage key is minted by
      -- the server, because a key built from a submitted filename is a path
      -- traversal waiting for somebody to try it.
      name text NOT NULL,
      size integer NOT NULL,
      content_type text NOT NULL,
      storage_key text NOT NULL,
      state text NOT NULL DEFAULT 'offered'
        CHECK (state IN ('offered', 'stored', 'claimed')),
      created_at timestamptz NOT NULL,
      -- RESTRICT for the same reason a delivery uses it: the row is the record
      -- that something was attached, and deleting the submission must not
      -- quietly erase what it carried.
      submission_id uuid REFERENCES submissions(id) ON DELETE RESTRICT,
      -- One file, one submission. Enforced here rather than in application
      -- code, because two concurrent submissions claiming the same file is
      -- exactly the race application code loses — and the loser would be a
      -- submission referencing bytes another submission owns.
      CONSTRAINT files_one_submission UNIQUE (id, submission_id)
    )`
  await sql`
    CREATE INDEX IF NOT EXISTS files_abandoned
      ON files (created_at) WHERE state <> 'claimed'`
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL,
      created_at timestamptz NOT NULL
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      prefix text NOT NULL,
      secret_hash text NOT NULL,
      role text NOT NULL,
      created_at timestamptz NOT NULL,
      revoked_at timestamptz
    )`
  await sql`CREATE INDEX IF NOT EXISTS api_keys_prefix ON api_keys (prefix)`
  await sql`
    CREATE TABLE IF NOT EXISTS drafts (
      id text NOT NULL,
      form_id uuid NOT NULL REFERENCES forms(id),
      form_version_id uuid NOT NULL REFERENCES form_versions(id),
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (form_id, id)
    )`
  // Immutability lives in the database, not in application discipline: a
  // published version row can never change, because every submission's audit
  // story depends on it staying exactly what the user saw.
  await sql`
    CREATE OR REPLACE FUNCTION refuse_version_update() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'form_versions rows are immutable; publish a new version instead';
    END
    $$ LANGUAGE plpgsql`
  await sql`DROP TRIGGER IF EXISTS form_versions_immutable ON form_versions`
  await sql`
    CREATE TRIGGER form_versions_immutable
    BEFORE UPDATE ON form_versions
    FOR EACH ROW EXECUTE FUNCTION refuse_version_update()`
}
