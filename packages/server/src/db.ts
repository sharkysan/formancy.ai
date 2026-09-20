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
      created_at timestamptz NOT NULL DEFAULT now()
    )`
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
