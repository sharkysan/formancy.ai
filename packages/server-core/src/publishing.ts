import { schemaHash } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import type { SchemaError } from '@formancy/spec/validate'
import type { ServerDeps } from './deps.js'
import type { ResolvedForm } from './use-cases.js'
import { createFormEngine, expressionProblems, unknownReferences } from '@formancy/core'
import { sourceNamesIn } from './options-membership.js'
import { examplesThatStopHolding } from './examples.js'
import type { AuditEntry } from './audit.js'
import type { Actor } from './auth.js'
import { unsafePatterns } from './redos.js'
import type { UnsafePattern } from './redos.js'


/**
 * Publishing a form: the save gate, and who may overwrite whom.
 *
 * Its own file because `use-cases.ts` had become the place every family went,
 * and the size budget refused the next thing added to it — the entry already
 * said the seam was one use-case family per file, and this is the family.
 */
export type PublishOutcome =
  | {
      ok: true
      formId: string
      versionId: string
      version: number
      schemaHash: string
      /**
       * Things worth telling the publisher that are not grounds to refuse.
       *
       * Always present, empty when there is nothing to say, so a caller reads a
       * list rather than branching on whether there is one. Sentences rather
       * than codes: the only consumers are a person reading a CLI, an admin
       * screen or a log, and a code would need a catalogue nobody would write
       * ([0097](../../../docs/decisions/0097-a-publish-may-warn.md)).
       */
      warnings: readonly string[]
    }
  | { ok: false; kind: 'invalid_schema'; errors?: SchemaError[] }
  | { ok: false; kind: 'invalid_logic'; message: string }
  | { ok: false; kind: 'unsafe_pattern'; patterns: UnsafePattern[] }
  /** The document names a list this deployment has never heard of. */
  | { ok: false; kind: 'unknown_options_source'; sources: string[] }
  /**
   * Somebody else published while this editor was editing.
   *
   * The same kind and the same body the submission path uses, deliberately: a
   * client that already knows how to handle one stale version handles both.
   */
  | { ok: false; kind: 'version_changed'; current?: ResolvedForm }
  /**
   * This exact document is already a version of this form, and not the current
   * one — somebody republishing an older version to undo a bad publish.
   *
   * `UNIQUE (form_id, schema_hash)` is what makes republishing the CURRENT
   * document idempotent rather than a version factory, and it refuses this too:
   * without this branch the insert raised and the route answered **500**. A
   * published version is immutable and cannot be published twice
   * ([0025](../../../docs/decisions/0025-immutability-in-the-database.md)), so
   * the honest answer names the version it already is.
   */
  | { ok: false; kind: 'already_published'; version: number }

/**
 * Publish a schema as a form's next version.
 *
 * This is the save gate: structural validation, then the ENGINE's own compile
 * — type-checked expressions, kind policies and the cycle graph — so a form
 * that can loop or read a ghost field is refused here and never persisted.
 * Republishing the identical document is idempotent, because "deploy again"
 * must never manufacture a version.
 */
export async function publishForm(
  deps: ServerDeps,
  input: {
    path: string
    schema: unknown
    actor?: Actor
    /**
     * The hash of the version this edit started from, when there was one.
     *
     * **Optional, and that is the decision.** A script, the CLI and an agent
     * publish a document they composed rather than one they opened, and have
     * nothing to declare; requiring it would make every one of them read the
     * current version first to satisfy a rule about editors. What declares is
     * the thing that OPENED a version — the builder — and declaring is how it
     * asks to be told it has been overtaken.
     */
    basedOnSchemaHash?: string
    /** The request this publish is answering, which its audit row names (`AuditEntry.requestId`). */
    requestId?: string
  },
): Promise<PublishOutcome> {
  const validated = validateSchema(input.schema)
  if (!validated.valid) return { ok: false, kind: 'invalid_schema', errors: validated.errors }
  const schema: FormSchema = validated.schema

  try {
    createFormEngine({ schema, capabilities: deps.capabilities })
  } catch (error) {
    return {
      ok: false,
      kind: 'invalid_logic',
      message: error instanceof Error ? error.message : String(error),
    }
  }

  // Expressions that compile and then fail for every value anybody enters.
  // The engine cannot refuse these — it declares leaves as `dyn` so that a
  // half-typed answer is not a type error, which also makes `seats * 4` look
  // fine until it runs. Refused here rather than at render, so a form already
  // published with the mistake keeps opening for whoever is filling it in.
  const problems = expressionProblems(schema)
  if (problems.length > 0) {
    return {
      ok: false,
      kind: 'invalid_logic',
      message: problems.map((problem) => problem.message).join('\n'),
    }
  }

  /*
   * And the ones that are worth saying rather than refusing.
   *
   * A rule reading a path no field provides is a real defect — it evaluates to
   * nothing for the life of an immutable version — and refusing it is not
   * available: documents valid today would become invalid tomorrow, and what a
   * reader accepts is the frozen version contract. Computed before the storage
   * branches below so that every successful return carries the same answer,
   * including the idempotent one.
   */
  const warnings = unknownReferences(schema).map((found) => found.message)

  // Before the schema is persisted, because after it is there is no way to
  // time out a regular expression that has already started matching.
  const unsafe = await unsafePatterns(schema)
  if (unsafe.length > 0) {
    return {
      ok: false,
      kind: 'unsafe_pattern',
      patterns: unsafe,
    }
  }

  // The source names a document uses, checked against the vocabulary this deployment
  // actually has — but only when it HAS one. With no `optionsSources` configured the
  // server cannot judge, so publishing is allowed and the audit detail records the
  // names, which is what lets an operator compare them with their configuration.
  //
  // Caught here rather than at the first submission, because a published version is
  // frozen forever: a form naming a list nobody can resolve is a form whose select
  // renders a message instead of a chooser, and nothing would have said so.
  if (deps.optionsSources !== undefined) {
    const unknown = sourceNamesIn(schema).filter((name) => deps.optionsSources?.[name] === undefined)
    if (unknown.length > 0) return { ok: false, kind: 'unknown_options_source', sources: unknown }
  }

  const hash = schemaHash(schema)
  const existing = await deps.storage.getFormByPath(input.path)

  if (existing !== undefined) {
    const current =
      existing.currentVersionId === null
        ? undefined
        : await deps.storage.getVersionById(existing.currentVersionId)
    if (current !== undefined && current.schemaHash === hash) {
      return {
        ok: true,
        formId: existing.id,
        versionId: current.id,
        version: current.version,
        schemaHash: hash,
        warnings,
      }
    }

    // AFTER the idempotent case on purpose. An editor whose document already
    // matches what is published has nothing to merge — somebody else wrote
    // exactly what they were going to write — and telling them to resolve a
    // conflict with themselves would be a worse answer than silence.
    if (input.basedOnSchemaHash !== undefined && input.basedOnSchemaHash !== current?.schemaHash) {
      return {
        ok: false,
        kind: 'version_changed',
        ...(current === undefined
          ? {}
          : {
              current: {
                formId: existing.id,
                versionId: current.id,
                version: current.version,
                schema: current.schema,
                schemaHash: current.schemaHash,
              },
            }),
      }
    }

    // An older version of this form already holds this exact document. The
    // unique index would raise on the insert and the route answered 500 —
    // reverting by republishing yesterday's document is a reasonable thing to
    // try, and it crashed.
    const already = (await deps.storage.listVersionsByForm(existing.id)).find(
      (candidate) => candidate.schemaHash === hash,
    )
    if (already !== undefined) {
      return { ok: false, kind: 'already_published', version: already.version }
    }

    const version = (await deps.storage.latestVersionNumber(existing.id)) + 1
    // The form's examples, against the version it has and this one: each that stops holding
    // is said, and nothing is refused for it (0166). A first publish has none to run, since
    // examples are kept beside a form the deployment already has.
    const stopped = await examplesThatStopHolding(deps.storage, existing.id, current, { schema, version })
    const versionId = deps.newId()
    await deps.storage.publishVersion({
      version: { id: versionId, formId: existing.id, version, schema, schemaHash: hash },
      audit: publishAudit(deps, input, {
        path: input.path,
        version,
        hash,
        sources: sourceNamesIn(schema),
      }),
    })
    return { ok: true, formId: existing.id, versionId, version, schemaHash: hash, warnings: [...warnings, ...stopped] }
  }

  // A base declared for a form that has none is an editor working from something
  // this deployment never published — a path that was deleted, or the wrong
  // instance. Publishing anyway would make their document version 1 of a form
  // they believe already has a history.
  if (input.basedOnSchemaHash !== undefined) {
    return { ok: false, kind: 'version_changed' }
  }

  const formId = deps.newId()
  const versionId = deps.newId()
  await deps.storage.publishVersion({
    form: {
      id: formId,
      path: input.path,
      currentVersionId: null,
      // A newly published form is private. Opening it is a separate,
      // deliberate act through setFormAccess.
      accessSubmit: 'authenticated',
      allowedOrigins: null,
    },
    version: { id: versionId, formId, version: 1, schema, schemaHash: hash },
    audit: publishAudit(deps, input, {
      path: input.path,
      version: 1,
      hash,
      sources: sourceNamesIn(schema),
    }),
  })
  return { ok: true, formId, versionId, version: 1, schemaHash: hash, warnings }
}

/**
 * The audit row for a publish, built here so it can travel INSIDE the
 * transaction rather than being appended after it.
 *
 * Before this it was written by the route once all three storage calls had
 * returned, which meant a publish could half-apply and still be recorded as
 * having happened. Now it rolls back with everything else.
 */
function publishAudit(
  deps: ServerDeps,
  input: { actor?: Actor; requestId?: string },
  about: { path: string; version: number; hash: string; sources: readonly string[] },
): AuditEntry {
  return {
    id: deps.newId(),
    at: deps.nowIso(),
    action: 'form.published',
    subject: about.path,
    ...(input.actor === undefined
      ? {}
      : { actorKind: input.actor.kind, actorId: input.actor.id }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    detail: {
      version: about.version,
      schemaHash: about.hash,
      /*
       * The lists this version needs the deployment to resolve, named in the record that
       * freezes it -- and only when there are any, so an ordinary form's audit row does
       * not grow a field saying "none".
       *
       * `SAFETY-ANALYSIS.md` A7 tells a manufacturer to treat `optionsSource` as a
       * per-field weakening of A6's guarantee, "enumerable from the publish audit
       * detail". It was not: this recorded the version and the hash and nothing else, so
       * the document described a record that did not exist. Written here rather than the
       * sentence being softened, because an operator comparing a form's sources with
       * their own configuration is exactly the use the sentence names.
       *
       * Joined into a string because an audit detail is flat by design -- one level, no
       * nesting, so a reader never has to walk it.
       */
      ...(about.sources.length === 0 ? {} : { optionsSources: [...about.sources].sort().join(', ') }),
    },
  }
}
