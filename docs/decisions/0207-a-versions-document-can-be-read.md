# 0207 — A version's document can be read by its number, so older submissions are read through it

- **Status:** accepted
- **Date:** 2026-10-28
- **Extends:** [0193](0193-a-submission-is-read-back-in-words.md) and
  [0206](0206-a-forms-responses-are-summarised-by-question.md), which read and summarised only the
  current version's submissions because no other version's document was handed out
- **Deciders:** Daniel Bacher
- **Verified by:**
  - **`packages/server-core/src/form-version.test.ts`.** `formVersion` gives the document a version
    was published with, by its number; an unpublished number is `unknown_version` and an unknown
    path `unknown_form`; ten other spellings of a number — `01`, `1.0`, `1e0`, `+1`, `0`, a space —
    are `unknown_version`; and another form's version, by its id or by its number, is as unknown as
    one never made. The spelling case failed with the parse loosened to `Number()`.
  - **`packages/server/src/version-route.test.ts`**: `GET /f/:path/versions/:version` answers the
    document, 404 `unknown_version` for an unpublished number under any spelling, and 401 without a
    session. Every case failed before the route.
  - **`apps/admin/src/workspace.test.tsx`**: a submission to version 1 is read under version 1's
    wording of its question, and each version is summarised on its own.

## Context

A submission answers the version it was made on, and a later version may ask different questions —
renamed, reworded, removed. The admin read submissions in words (0193) and summarised them (0206)
only for the current version, because the server handed out no other version's document: the
history route lists versions without their documents, on purpose, so a history view is not fifty
documents long.

## Decision

**`GET /f/:path/versions/:version`**, behind `form.read` like the history: the document one version
was published with, its number and its hash.

- **Looked up among this form's own versions.** Another form's version — by its id, or by a number
  this form has not published — is the same 404 `unknown_version` as a version never made, so
  reading one form never says anything about another's.
- **One spelling per version**: the number's own digits, with no sign, leading zero, fraction or
  exponent. Any other is `unknown_version`, so one document has one address.

**The admin reads each submission through its own version's document**, fetching one per version
that has submissions, and draws a summary per version, newest first. A version whose document cannot
be fetched leaves its submissions as stored, as before.

## Consequences

**A submission to an old version reads as it was answered**, under the question as that version
asked it, and a summary never counts one version's answers under another's questions.

**One request per version with submissions**, each a whole document. A form with many published
versions costs as many requests when its submissions are opened; the history stays light.

## Alternatives considered

**Put the documents in the history.** One request instead of several, and the history's reason for
leaving them out — a history view that is the whole document fifty times — returns.

**Read every submission through the current version.** One document, and an answer to a removed or
renamed question shown under the wrong one, or not at all.
