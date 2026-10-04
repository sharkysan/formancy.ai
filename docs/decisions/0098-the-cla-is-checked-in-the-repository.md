# 0098 — The CLA is checked in the repository, not by a bot with a token

- **Status:** accepted
- **Date:** 2026-10-04
- **Deciders:** Daniel Bacher
- **Verified by:** `.github/workflows/cla.yml` runs `scripts/check-cla.mjs` on every
  pull request and fails naming any commit author it has no signature for.
  `apps/docs/src/cla.test.ts` calls that script's own functions — ten mutations were
  applied and each one observed failing the case meant to catch it, including a
  fail-open on an unreadable commit range. `apps/docs/src/claims.test.ts` checks that
  the documents a contributor reads name the agreement and the record by the paths the
  check actually uses. What nothing here verifies is whether a signature is legally
  worth anything; that is said below rather than implied away.

## Context

[0069](0069-contributions-under-a-cla.md) decided a CLA on 2026-09-27 and wrote down
the half it had not done: "a CLA nobody checks is a document in a repository. That is a
CI gate on pull requests from outside the organisation, and until it exists the terms
are stated and unverified."

A week later that was still the state, and three documents said so in three different
ways. `CONTRIBUTING.md` told a contributor the agreement was "stated and unverified"
and to open an issue first. `GOVERNANCE.md` said "no CLA bot runs". And
[§11.5](../architecture/11-risks-and-debt.md) still listed **"CLA or DCO"** as
genuinely undecided — which had been false for a week, and is the shape of wrong
statement this repository treats as worse than an absent one: an absent one prompts the
question, a wrong one answers it incorrectly. It was found by being asked what the open
decisions were and reading that section instead of the decision records.

The deadline 0069 set is the **first external pull request**. Nothing about that
deadline announces its arrival.

## Decision

**The record of who has agreed lives in the repository, and a node script checks it on
every pull request.** No third-party service, no bot account, no token.

- `CLA.md` is the agreement, adapted from the Apache Individual Contributor License
  Agreement and shortened: a copyright licence broad enough to sublicense, a patent
  licence mirroring Apache-2.0 section 3 including its retaliation clause, the
  statements 0069 named, and no assignment of copyright.
- `.github/cla/signatories.json` is the record. Each entry carries a name, the
  addresses that person commits from, a date, and **the hash of the agreement text as
  it stood when they signed**.
- Signing is a commit. The contributor adds their own entry under their own git
  identity, so the signature is the commit: who, when, and the hash of exactly what.
- `scripts/check-cla.mjs` reads the commit **authors** between the fork point and the
  head of a pull request and names any the record does not cover.

**Two refusals in that script are the decision, not details.**

It **refuses a range it cannot read**. `git log base..head` answering nothing is
indistinguishable from a range that is genuinely empty, and both happen — a wrong base
SHA, a shallow clone without the base commit, a rebase that moved the range. Returning
"nobody is missing" would turn every one of those into a pass, which is the failure
mode that looks exactly like success.

It **refuses a signature recorded against text that has since changed**, and reports
that differently from no signature at all. The two ask the contributor for different
things: one is "sign this", the other is "the terms moved under you, read them again".

**Authors, not committers.** A CLA is about whose copyrightable work is in the branch,
and that is the author. The committer can be the platform: 153 commits on `main` are
committed by `GitHub <noreply@github.com>` from squash merges and web edits, and one by
`noreply@anthropic.com`. Checking committers would demand signatures from identities
that contributed nothing and cannot sign.

**A machine gets an exemption with a reason, not a signature.** Six commits here were
authored by `copilot-swe-agent[bot]`, every one on the maintainer's instruction and in
his account. It cannot hold copyright and cannot agree to anything, so there is nothing
for it to sign; the work is the maintainer's contribution and his entry covers it. The
record holds that as a `machines` entry whose `reason` field is required — an exemption
is the one entry that grants cover without anybody agreeing to anything, so the reason
*is* the entry. Inventing a signature for a bot would have been the dishonest way to
make the file green.

**The maintainer is in the list rather than exempt.** A licence to oneself grants
nothing, so his entry is not one — it is the check's only exemption written down
instead of hidden in a comparison against the repository owner's login. It also pins
the address this project commits under, which was a convention in a file nothing read.

## Consequences

**Editing `CLA.md` invalidates every signature, including for a typo.** The hash is
over the whole file, so any change makes every recorded signature stale and the check
says so by name. That is the cost, chosen deliberately: a signature that does not say
what was signed is a date next to a name. With one signatory it is a one-line fix; with
fifty it would be a campaign, and at that point the right answer is to version the
agreement and let a signature name the version it covers rather than to loosen the
check.

**The check is reported, not enforced, and that is a real gap.** `main` carries no
branch protection rule, so no check on this repository is mechanically required —
not this one and not CI. What stops an unsigned contribution is a maintainer reading a
red check, which is the same thing that stops a failing test today. Enabling protection
and requiring this check is the remaining step, and it is repository configuration
rather than anything in this tree, so no file here can assert it. Nothing in the
repository claims otherwise: the script's own failure message says "a maintainer will
not merge until this passes" rather than "nothing is merged", because the second would
be a wrong statement where an absent one costs nothing.

**It does not verify that a signature means anything.** Whether a commit adding one's
own name constitutes an enforceable agreement, and whether this text grants what it
means to, are questions for a lawyer. `CLA.md` is adapted from a widely used agreement
and has not been reviewed by one. The gate makes the *absence* of a signature loud,
which is what 0069 asked for, and claims nothing further.

**A contributor must list every address they commit from.** A second machine with a
different git identity fails the check, and the message names the address, so the
failure is self-explaining rather than mysterious. The alternative — matching on GitHub
login — cannot see the commit identity at all, which is the thing the licence attaches
to.

**It costs nothing to run.** The script imports only node's own library, so the
workflow needs no install step and answers in seconds. That matters more than it
sounds: a check that depends on the workspace installing stops working exactly when
somebody most wants to merge something quickly.

## Alternatives considered

**CLA Assistant, or `contributor-assistant/github-action`.** The default answer, and it
does more than this: it comments on the pull request and lets a contributor sign by
replying, which is a genuinely better experience than editing a JSON file. Rejected on
what it needs to do that — a personal access token with write scope, stored as a
secret, used by a third-party action, under `pull_request_target`, which runs with the
base repository's permissions against a fork's code. That combination is the
best-documented way to hand a repository away, and this is a repository whose whole
pitch includes a strict CSP and no third-party round-trips
([0059](0059-proof-of-work-not-a-captcha.md) made the same trade for the submission
challenge, and paid for it in measurement rather than taste). It is also untestable
from here: a third-party action cannot be mutated and watched to fail.

**A DCO check instead** (`Signed-off-by` on every commit, verified by a workflow). Much
lighter, and the usual tooling is excellent. Rejected because 0069 decided a CLA, and a
DCO check would verify a certification the project did not ask for while leaving the
one it did ask for unverified — the worst of both, with a green check on top.

**A hosted CLA service** (cla-assistant.io and similar). Rejected for the reason the
whole product exists: a self-hostable, European-deployable project routing its
contributor agreements through somebody else's database is an odd look, and the data is
exactly the kind that is awkward to have elsewhere.

**Doing the record and not the gate** — publishing `CLA.md`, asking contributors to
sign by hand, and checking by eye. This is what 0069 left in place and what this record
replaces. Rejected because it was already a week old, the deadline is an event nobody
schedules, and the repository's own rule is that a guard which is not a gate is a
comment.

**Checking the pull request author's login rather than commit authors.** Simpler, and
wrong in both directions: a pull request can carry commits authored by somebody else,
and a contributor's GitHub login is not the identity the copyright attaches to.
