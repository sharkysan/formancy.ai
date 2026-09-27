# 0069 — Contributions under a CLA

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** Daniel Bacher
- **Verified by:** Nothing automated, and that is stated rather than papered over. This is
  a legal and governance decision; no test can check that a contributor signed anything.
  What *can* be checked is that the repository says so consistently, and
  `apps/docs/src/claims.test.ts` is where a guard would go if `GOVERNANCE.md` and
  `CONTRIBUTING.md` ever disagree about the answer. The enforcement is a CLA bot on the
  pull request, which is CI configuration rather than a test.

## Context

[0002](0002-apache-2-0.md) chose Apache-2.0 and left one thing open, in as many words:
"whether contributions are taken under a CLA or a DCO is **not yet decided**".
`GOVERNANCE.md` says the same and adds the reason it mattered: the choice "cannot be made
retroactively once outside contributors exist".

The two options are not symmetrical.

A **DCO** — a `Signed-off-by` line certifying the contributor has the right to submit the
work — is lighter, asks nobody to sign anything, and is what a drive-by contributor
expects. It also makes relicensing effectively impossible once there are contributors,
because every one of them would have to be found and asked.

A **CLA** asks contributors to grant rights broad enough to include relicensing. On a
young project positioned against a commercial incumbent it reads as "they plan to
relicense", and measurably suppresses contributions. It also preserves the option the
business model depends on.

**The business model is what settles it.** The open-core line is written down: the spec,
the engine, every renderer, the full builder and the self-hostable backend are free
forever; managed hosting, multi-tenancy, SSO, audit logs, PDF and e-signature are sold.
Some of that is a proprietary build of code that also exists here. Without a CLA that
option closes the day a first outside contribution is merged, and closing it by accident
is the one outcome nobody would choose deliberately.

**The deadline moved, and the earlier framing was wrong.** The design document said to
settle this "before the repo goes public". The repository is already public. What is
actually still true is narrower and is the thing that matters: 0002 says formancy "is
closed to outside contributions until it is decided", and every merge so far has come from
the maintainer's own branches, so there are no external contributors yet. The deadline is
**the first external pull request**, not publication.

## Decision

**A CLA, from now, before the first external contribution.**

**And the gap that made this urgent is closed at the same time.** There was no
`CONTRIBUTING.md`. The position "closed to outside contributions until the contributor
agreement is decided" lived only in a decision record and in `GOVERNANCE.md` — so somebody
arriving at a public repository had nowhere obvious to read it before opening a pull
request, and the first external contribution would have arrived with no terms attached at
all. That is the failure this decision exists to prevent, and it was one accident away.

**The CLA asks for the narrowest grant that keeps the option open**: a copyright licence
broad enough to sublicense, an express patent licence matching Apache-2.0's, and a
statement that the contributor has the right to grant them. It does not ask for copyright
*assignment*. Contributors keep ownership of their work; what the project gains is
permission, not property. Assignment would buy nothing the licence does not and is the
version of a CLA people are right to object to.

## Consequences

**It will cost contributions, and pretending otherwise would be dishonest.** A signing
step before a first pull request is a step some people will not take, and the objection
that a CLA signals an intent to relicense is not paranoia — it signals exactly the option
this decision exists to keep. The mitigation is to be plain about why in
`CONTRIBUTING.md` rather than to bury it: a contributor who understands the open-core line
can decide for themselves, and one who discovers it later has a grievance.

**It has to be enforced mechanically or it is theatre.** A CLA nobody checks is a document
in a repository. That is a CI gate on pull requests from outside the organisation, and
until it exists the terms are stated and unverified — which is worth saying out loud
rather than assuming the file does the work.

**The alternative stays available in one direction only.** A project on a CLA can always
accept a contribution under weaker terms; a project on a DCO cannot later gain the rights
it did not ask for. That asymmetry is the whole argument, and it means this decision can be
softened later and not hardened.

**Apache-2.0 does not change.** The outbound licence is unaffected: this is about what the
project may do with contributions, not about what anybody receives. Every published package
stays Apache-2.0 with its patent grant and its retaliation clause
([0002](0002-apache-2-0.md)).

## Alternatives considered

**A DCO.** The friendlier answer, and the right one for a project that will never sell a
proprietary build. Rejected because this one intends to, and the cost of being wrong is
asymmetric: a DCO chosen now cannot be upgraded, while a CLA can always be relaxed.

**Deciding later and saying nothing.** Rejected as the status quo that created the risk.
The repository is public, has no `CONTRIBUTING.md`, and a first external pull request would
have arrived under no terms at all.

**Copyright assignment instead of a licence.** Rejected: it takes ownership from
contributors to buy a permission the licence already grants, and it is the shape of CLA
that deserves its reputation.

**A Linux Foundation-style CAA.** A reasonable variant, and worth revisiting if the project
ever moves to a foundation. Rejected for now as more process than a single-maintainer
project can honestly operate — `GOVERNANCE.md` says BDFL-for-now and it should not claim
more.
