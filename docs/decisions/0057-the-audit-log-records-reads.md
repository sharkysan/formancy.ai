# 0057 — The audit log records reads, and never the data

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Daniel Bacher
- **Verified by:** `packages/server-core/src/audit.test.ts` (12 cases,
  including the one that keeps mattering: a submission's answers do not appear
  anywhere in the row that describes it) and the `the audit log` block in
  `packages/server/src/server.integration.test.ts` against real PostgreSQL,
  which is the only place the two claims that need a database can be shown —
  that a refused submission leaves no row saying it happened, and that the
  table refuses `UPDATE` and `DELETE`.

## Context

SP-6's "done when" says every mutation writes an audit row in the same
transaction. It has never been built, and the gap gets more expensive with
every submission collected: a log that begins today cannot answer a question
about last month.

Two things about audit logs are easy to get wrong in ways nobody notices,
because the product works either way.

## Decision

**Reads are recorded, not only writes.** `submission.read` and
`submission.exported` are in the vocabulary alongside `submission.created`. A
log of mutations tells you who changed the form. It does not tell you who read
four thousand people's answers and downloaded them, which is the question a
data protection officer actually asks and the one a self-hoster otherwise has
no way to answer. Failed logins are recorded for the same reason: a hundred
failures followed by one success is the shape of an attack, and recording only
the success hides it.

**The log never contains the data.** `detail` carries identifiers and counts —
a submission id, a schema version, a row count, a byte count. An audit log is
read by more people, kept longer and exported more freely than the data it
describes, so answers inside it make every one of those a second copy of the
thing being protected. There is a test asserting the submitted values are
absent from the row, because the natural way this breaks is somebody adding a
helpful field later.

**Append-only in the database.** A trigger refuses `UPDATE` and `DELETE`, for
the same reason `form_versions` rows are immutable there: the one moment it
matters is the moment somebody has a reason to edit it, and by then application
discipline is whatever the intruder wants it to be. The port exposes no update
and no delete for anything to call. A deployment should also grant the
application's role `INSERT` and `SELECT` only — the trigger is the belt, the
grant is the braces, and the grant is the part a self-hoster has to do
themselves.

**The row joins the transaction wherever there is one.** Today that is exactly
one place and it is the one that matters: `insertSubmission` already commits
the submission, its webhook deliveries and its file claims together, and the
audit row commits with them. A submission that rolled back leaves nothing
behind saying it happened.

## Consequences

**What it costs, stated rather than left to be discovered.** Two categories of
event are appended after the fact rather than transactionally, for two
different reasons:

- A **read** is not a mutation. There is nothing to be atomic with. The
  residual risk is an export that succeeds and an audit row that does not;
  the failure is logged at error level and the request stands, because a 500
  after the rows have already been written to the response helps nobody.
- A **publish** is three storage calls — create the form, insert the version,
  point the form at it — and they are not yet one transaction. That is a
  pre-existing gap this record does not close. Until it is closed, the publish
  audit row is appended after all three succeed, so the failure mode is a
  publish with no audit row rather than an audit row with no publish. The
  better of the two, and still not the promise.

**Reading the log is not itself audited.** A log that records its own reads
grows without bound from any dashboard that polls it, and the entry would say
nothing an access log does not. The events worth recording are the ones that
touch somebody else's data.

## Alternatives considered

**Record mutations only.** Rejected: it is the common shape and it answers the
wrong question. The expensive incident is somebody reading data they should
not have, and a mutation-only log is silent about it.

**Put the submission's data in the row, for context.** Rejected on the
reasoning above. The context that is actually wanted — which form, which
version, which submission — is available from identifiers, and the submission
itself is one join away for anybody entitled to it.

**Enforce append-only in application code.** Rejected: it is enforcement that
evaporates exactly when it is needed. The trigger costs one function and one
`CREATE TRIGGER`.

**A separate audit database.** Rejected for v1: it would put the audit row
outside the submission's transaction, which is the one property worth having,
and trade it for an isolation guarantee a single-container deployment cannot
provide anyway.
