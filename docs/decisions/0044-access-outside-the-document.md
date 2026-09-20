# 0044 — Who may submit is a property of the deployment, not of the document

- **Status:** accepted
- **Date:** 2026-09-20
- **Deciders:** Daniel Bacher
- **Verified by:** the `public submission access` block in
  `packages/server-core/src/use-cases.test.ts` — seven tests covering the
  private default, the authenticated bypass, opening a form, exact origin
  matching, a missing `Origin` header, and an empty allowlist. Against a real
  database, "a freshly published form refuses anonymous submissions" and
  "opening the form to the public is a separate, deliberate act" in
  `packages/server/src/server.integration.test.ts`. The column defaults to
  `'authenticated'` in the DDL with a `CHECK` constraint, so a row inserted by
  a migration or a fixture is private too.

## Context

Anonymous submission is the highest-risk surface in the product, so a form must
be private until somebody says otherwise. The original design put that switch
in the form document, as `access.submit`.

By the time the work started, the spec had frozen at version 1
([0042](0042-freeze-the-spec.md)) without it. That forced the question rather
than settling it: either bump to spec 2 for a boolean, or decide the property
was in the wrong place.

It was in the wrong place. A form document has to mean the same thing wherever
it is moved — exported, imported into a staging environment, committed to a
consumer's repository, sent to another organisation. A document carrying
"anyone may submit this" would carry it across every one of those boundaries,
and the boundary is exactly where the answer changes. The spec is a data
contract; this is a permission.

## Decision

`accessSubmit` and `allowedOrigins` live on the **form record** in the
database, not in the form document. They are changed through
`PUT /f/:path/access`, separate from publishing, so opening a form does not
mint an immutable version or invalidate the schema hash every client is
holding.

Every branch fails closed:

- A newly published form is `authenticated`. The unsafe value requires somebody
  to have typed it.
- An authenticated actor is unaffected — the policy governs the anonymous path.
- `allowedOrigins` is **nullable**, and null and empty mean different things:
  null is "no allowlist in force", empty is "nothing is allowed". A plain array
  could not express the second without a sentinel.
- A request with no `Origin` header is refused once an allowlist exists.
  Absent is not allowed.
- Origins match exactly. `https://evil-example.ch`, `https://example.ch.evil.test`,
  `http://example.ch` and `https://example.ch:8443` are all different origins
  from `https://example.ch`, and a prefix or suffix comparison would admit
  some of them.
- The 403 says only `forbidden`. "Not public" and "not from your origin" are
  the same answer to somebody probing.

## Consequences

**What it buys.** A form document stays portable and means one thing. Access
policy lives with the deployment that is responsible for it, changes without
touching version history, and defaults safely in the database as well as in the
code.

**What it costs.** Access does not travel with an exported form, so a
deployment that imports one must set it again — deliberate, but a real step
somebody will forget. The setting is also invisible in the document, so
reviewing a schema in git does not tell you who can submit it; that has to be
read from the server. And a spec-level property would have been enforceable by
`validateSchema` in the builder, which this is not.

**What it does not cover.** This is one of the layers the design called for.
Submission tokens, a challenge, honeypots, minimum fill time and rate limiting
are still absent, and the public plane should not be considered hardened until
they exist.

## Alternatives considered

**Bump the spec to 2 and add `access.submit`.** Rejected. It would have spent
the version line on something that does not belong in the document, days after
freezing it — and the freeze is only worth anything if it holds against the
first inconvenience.

**Keep it in the document but ignore it on import.** Rejected: a property that
is present and sometimes meaningless is worse than one that is absent, because
a reader cannot tell which case they are in.

**Default to public and require opting out.** Rejected outright. The default
must be the value that is wrong safely.
