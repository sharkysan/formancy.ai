# Contributing

Thank you for looking. Two things to know before you spend any time.

## Contributions are taken under a CLA

Before a pull request from outside the project can be merged, you sign a Contributor
License Agreement. It asks for a copyright licence broad enough to sublicense, an express
patent licence matching Apache-2.0's, and your statement that you have the right to grant
them.

It does **not** ask you to assign copyright. You keep ownership of your work; what the
project gains is permission.

**Why, plainly.** formancy is open core. The spec, the engine, every renderer, the full
builder and the self-hostable backend are free forever under Apache-2.0. Managed hosting,
multi-tenancy, SSO, audit logs, PDF output and e-signatures are what will be sold, and
some of that is a proprietary build of code that also lives here. Without a CLA, that
option closes the day a first outside contribution is merged, and it cannot be reopened
afterwards.

That is a real trade and you may not like it. A CLA does signal that the project keeps the
option of a proprietary build — because it does. Better that you read it here than
discover it later. The reasoning, including the case for a DCO instead, is in
[0069](docs/decisions/0069-contributions-under-a-cla.md).

### How to sign

[`CLA.md`](CLA.md) is the agreement. Signing it is a commit in this repository, under
your own git identity, adding yourself to
[`.github/cla/signatories.json`](.github/cla/signatories.json) — the hash of the terms
you agreed to goes in beside your name, so the signature says what was signed. The
steps are in `CLA.md` under *How to sign*; there is no form and no third-party service
([0098](docs/decisions/0098-the-cla-is-checked-in-the-repository.md)).

`.github/workflows/cla.yml` runs on every pull request and names any commit author it
has no signature for. It reads commit **authors**, so list every address you commit
from — a second machine with a different git identity is the way this fails in
practice, and the failure names the address so you are not left guessing.

## The project is pre-1.0, and that changes what is useful

The packages are published from CI and their APIs will change before 1.0. **Both spec
versions are frozen**, so a change that would alter what a form document may contain is a
new spec version and not a patch — see [`MIGRATIONS.md`](MIGRATIONS.md) before proposing
one.

Before writing code, **open an issue**. A pull request that arrives unannounced is likely
to collide with something in flight or to solve a problem in a way a decision record
already rejected — and `docs/decisions/` is long, so the fastest route is to ask rather
than to read all of it.

The most useful contributions right now are not code:

- **A form this cannot express.** Concrete and from real work, not hypothetical. That is
  the feedback the spec needs while there is still time to change it.
- **An accessibility failure.** The claim is WCAG 2.2 AA by default and the automated
  floor only catches roughly 57% of machine-detectable issues. A real screen-reader
  finding is worth more than anything else here.
- **A wrong statement in the documentation.** Especially in `docs/regulatory/` — that set
  exists for somebody incorporating formancy under IEC 62304, and a wrong statement there
  is worse than an absent one.

## If you do write code

[`CLAUDE.md`](CLAUDE.md) is the working guide and it is not decoration — it is what
reviews are against. The short version:

- **Tests first, and watch them fail.** A test that has never failed has not been shown to
  test anything. Every case says which failure it prevents.
- **Documentation ships in the same pull request as the code**, including the changelog,
  the decision record where there is a decision, and the regulatory set where a change
  touches what the software does wrong or how it is verified.
- **Measure numbers, do not estimate them.** The one number in this repository that was
  estimated was wrong by a factor of thirty, and it was hiding a design error.
- Branch from `main`, target `main`. Name the branch after what it changes.
- Run the gates for what you touched: `pnpm build`, `pnpm build:web`, `pnpm typecheck`,
  `pnpm test:coverage`, `pnpm check:pkg`.

## Reporting a vulnerability

Not here. [`SECURITY.md`](SECURITY.md) has the coordinated-disclosure process — please do
not open a public issue for a security problem.

## Governance

One maintainer, stated honestly in [`GOVERNANCE.md`](GOVERNANCE.md). That is also why
response times are not promised: there is no commercial support and no service-level
agreement.
