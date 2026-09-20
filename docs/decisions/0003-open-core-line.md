# 0003 — Give away the engine, sell operating the platform

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** Not mechanically enforced, and it cannot be: where the
  commercial line falls is a promise, not a property of the code. What is
  checkable is that nothing gates the free side — all ten packages declare
  `"license": "Apache-2.0"` and `publishConfig.access: "public"`, and the
  repository contains no licence-key, entitlement or feature-flag code. Nothing
  fails if a feature moves across the line.

## Context

This is a commercial push, so something has to be sold, and the choice of what
is the choice that decides whether anyone adopts the thing. form.io charges for
the embeddable builder, for accessibility and for premium components — which is
to say, for the things a developer needs in order to use the library at all.
That is what makes the incumbent frustrating: the paywall stands in front of the
evaluation, before anyone has decided whether the product is any good.

## Decision

Free forever, under Apache-2.0 ([0002](0002-apache-2-0.md)): the spec, the
engine, every renderer, the builder, the self-hostable backend, the standard
components, accessibility and the themes. Sold: managed hosting, multi-tenancy,
SSO/SAML, audit logs, PDF and e-signature, analytics, and support. The line is
drawn at operating the platform rather than at using it.

## Consequences

**What it buys.** A self-hoster never hits a paywall, which is the adoption
argument and only works if it is true without qualification. Revenue comes from
running the platform for someone rather than from withholding what a developer
needs in order to evaluate and adopt it. The sold features are ones a
self-hoster with an operations team can credibly do without, and that is what
makes giving away everything else affordable rather than reckless.

**What it costs.** The sold list is thin at v1 and every item on it is unbuilt.
The revenue story therefore rests entirely on future work, not on anything that
has shipped: today there is a great deal to adopt and nothing to buy.

**What it forecloses.** Multi-tenancy is on the sold side, so it is absent from
v1 entirely. That constrains the data model less than it sounds, but adding it
later touches every table.

## Alternatives considered

**Charge for the builder, accessibility and premium components, as the
incumbent does.** Rejected: those are the parts a developer needs before they
can judge the product, so gating them puts the price in front of the trial. It
is the specific frustration this project is a response to.

**Restrict hosting through the licence instead.** Rejected in
[0002](0002-apache-2-0.md). A source-available licence would blunt the cloud
provider risk, but at the cost of the one claim that distinguishes the project,
and the risk is better answered by being the people who operate it well.
