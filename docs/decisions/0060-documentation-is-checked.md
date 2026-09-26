# 0060 — Documentation claims are checked by tests, not by care

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Daniel Bacher
- **Verified by:** `apps/docs/src/soup.test.ts` (6 cases: every published
  package has a row and nothing else does, each row names the package's
  third-party dependencies at the ranges the manifest actually asks for, a
  package with a peer says so, the spelled-out package count matches the rows,
  the engine really has no third-party runtime dependency, and the version the
  SOUP declaration characterises is the version the packages carry),
  `packages/server/src/dockerfile.test.ts` (3 cases, deriving the image's COPY
  list from the server's workspace dependency closure),
  `apps/docs/src/counts.test.ts` (8 cases: the README states no record count
  and nothing reintroduces one, the landing page derives its figure rather than
  holding a literal, the site's own case still resolves records independently,
  the numbering has no gaps or repeats, and every record carries a status, a
  date, a title matching its number, a **Verified by** line and an entry in the
  index), the decision-record and field-type count cases in
  `apps/site/src/site.test.tsx`, and [`CLAUDE.md`](../../CLAUDE.md), which
  states the obligation in the place the obligation is read.

## Context

formancy publishes an unusually large documentation set for its size: 60
decision records, a regulatory set written for a manufacturer incorporating it
under IEC 62304, a changelog with reasons attached. The whole value of that set
is that a reader can trust it. A set that is 95% true is one a reader has to
verify themselves, which is worth the same as none.

**Prose does not break.** That is the entire problem. Three failures in this
repository make the shape of it clear, and none of them was a careless edit:

**The SOUP composition table drifted three packages and four dependencies.**
`challenge`, `builder-react` and `mcp` were added; `server-core` acquired
`@noble/hashes` and `recheck` while the table still said "none"; `server` grew
`undici`. No diff shows any of this, because the table never changed — the code
did. A manufacturer builds their own dependency assessment on that table, so the
wrong version of it is worse than an absent one: an absent one prompts the
question, a wrong one answers it incorrectly.

**The container's COPY list fell behind a new dependency.** `server-core` grew a
dependency on `@formancy/challenge`, the Dockerfile was not told, and the image
built cleanly, passed every test, and died on startup with
`ERR_MODULE_NOT_FOUND` ([0056](0056-agents-get-the-checks.md) is the adjacent
argument). The build is silent because the missing package is only needed at
runtime; the suite is silent because it never runs the container.

**A documented number was wrong in a way that hid a design error.** The
proof-of-work challenge's difficulty was documented as "around a tenth of a
second" for a hundred thousand hashes. Measured, it was 3,408 ms. The number was
not a typo — the overhead was `crypto.subtle`'s per-call boundary, which made
the legitimate visitor pay about 18× what an attacker writing a synchronous loop
pays, and **a proof of work where the defender pays more than the attacker is
worse than none** ([0059](0059-proof-of-work-not-a-captcha.md)). Nobody would
have found that by proofreading the sentence.

**And the counts on the landing page drifted three times**, because every week
adds a decision record. That one had already turned `main` red through a
semantic merge conflict: two branches, neither textually conflicting, one adding
a record and one stating the total. It is the clearest case of the pattern,
because nobody was careless at any point — the figure simply belonged to a
branch other than the one that changed it.

## Decision

**Where a document states a fact about the repository, a test asserts it, and
the document names the test.** Not a review checklist, not more care — a thing
that fails.

Three shapes, in order of preference:

1. **Derive it.** Best where the document is generated (the spec reference in
   `apps/docs`). Nothing to drift.
2. **Check it.** A test reads the document, parses the claim out of it, and
   compares it against the repository. This is what `soup.test.ts` and
   `dockerfile.test.ts` do, and it is the right shape when the prose around the
   fact is worth writing by hand — which, in a regulatory document, it is.
3. **Measure it.** Any figure about behaviour or cost is measured and the
   measurement is committed, never estimated in prose.

Two rules attach to this:

- **A guard is watched to fail before it is trusted.** Revert the thing it
  guards, observe the failure, put it back. This is the repository's existing
  test-first rule ([`LIFECYCLE.md`](../regulatory/LIFECYCLE.md)) applied to
  guards, which are the tests most likely to be written green and to stay that
  way for the wrong reason.
- **Documentation is part of the change, in the same commit.** `CLAUDE.md`
  carries the table of which document each kind of change makes untrue, because
  that is the file read at the start of every session — an obligation recorded
  where nobody looks is not recorded.

## Consequences

**Some facts become awkward to state, and that is the point.** "Ten packages"
survived three packages being added, because a spelled-out word does not read as
a number. It is now checked against the rows, which means adding a fourteenth
package requires spelling fourteen — a deliberate, one-line cost paid at the
moment the fact changes rather than silently at every later reading.

**The regulatory set gains a property it needs.** IEC 62304 §7.1.2 asks for a
characterisation of what the software needs from third parties. A characterisation
nobody can verify is a claim; one a test holds in place is evidence. The same
argument applies to the version statement: a characterisation describes one
version and no other, so a release that does not redo it must fail something.

**What this does not do.** It checks facts about the repository, not judgements
about it. Nothing asserts that a decision record's reasoning is sound, that the
safety analysis found every hazard, or that the prose is clear. Those stay
human, and no amount of this reduces them. The set's honesty about its own
limits ([`MDR-CONTEXT.md`](../regulatory/MDR-CONTEXT.md)) is not a thing a test
can hold up.

**A cost worth naming:** these tests couple documents to code, so moving a
document breaks a test. That is the intended direction of the coupling — the
alternative is a document that keeps its filename and loses its accuracy.

## Alternatives considered

**A review checklist.** Rejected as the thing that had already failed. Every one
of the four drifts above happened while the author knew the rule; the
documentation obligation was being carried in conversation, and conversation
does not survive a context window or a new contributor.

**Generating the regulatory documents entirely.** Rejected: the prose is the
substance. A generated SOUP declaration would state the dependencies and lose
the argument about which one to look at closely and why its bus factor is
handled architecturally, which is the part a manufacturer actually needs.
Checking a hand-written document gets both.

**Keeping the landing page's count as a literal with a test over it.** This was
the position taken when this record was first drafted, on the grounds that
deriving the number would make the test tautological and that the literal is
what a reader of the source sees. It was wrong, and the branch this record
landed on had already done the better thing: `apps/site/decision-records.ts`
counts the directory when the site is built and hands the number in as a Vite
define.

Two things settle it. **A guard still costs a red build**, and the cheapest
failure is the one that cannot happen — the literal's failure mode was red CI
on an unrelated branch, which is a tax on whoever adds the next record rather
than on whoever caused it. And the test does **not** become tautological,
because the site's case resolves records through a bundler glob while the build
resolves them through `readdirSync`: two definitions of “a record”,
cross-checked. What is guarded afterwards is the *mechanism* —
`apps/docs/src/counts.test.ts` fails if a literal is put back, which would
otherwise pass every existing test until the next record was added, which is
precisely how the previous three got in.

The README took the third way out: it now says “the decision records” and
carries no figure at all. A static Markdown file has no build step to derive one
in, and the number was never the point of that sentence — it was there to
suggest the set is substantial, which the link already does. **Where a count is
not the point, the cheapest correct answer is to stop stating it**, and what is
checked afterwards is that nobody puts one back.

That leaves the check-it shape for the case it is actually needed in: prose
whose substance is the fact, like the SOUP composition table, where removing the
fact would remove the document's reason for existing.
