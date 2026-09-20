# 0034 — Conformance drivers resolve elements by role and accessible name only

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** partially. `validateFixture` in
  `packages/conformance/src/validate.ts` refuses a fixture whose visible leaf
  fields carry no label, an `addItem` or `removeItem` step on a repeater without
  `addLabel` or `removeLabel`, and a `{ $t }` label the default locale does not
  define; the cases are in `packages/conformance/src/validate.test.ts` under "a
  fixture a driver cannot reach by accessible name". The rule itself is **not
  mechanically enforced**: a driver that reached for a test id would pass
  undetected. It is held by review, and the header of
  `packages/conformance/src/driver.ts` says so rather than implying otherwise.

## Context

A driver has to find the control for a given data path. The easy way is a test
id or a CSS selector. The easy way also means a renderer can emit markup that no
screen reader can navigate and still pass every test in
[0033](0033-one-suite-n-drivers.md).

## Decision

The rule of the conformance suite is that a driver may resolve elements by
accessible name and role only: `getByRole`, `getByLabelText`,
`getByRole('group', { name })`. Never a test id, never a CSS selector, never a
component instance. A renderer whose markup is not queryable by role and
accessible name fails conformance.

## Consequences

**What it buys.** Accessibility stops being a separate workstream and becomes a
structural property of passing the suite. An unlabelled input, a combobox built
from unlabelled divs, an error message not associated with its control: none can
be driven, so none can pass. The rule earned its keep on the first
fixture containing a radio group, which proved that React's driver could never
have answered one: the radio branch sat below a control lookup that throws
first, and a group's accessible name is on the fieldset, not on any control.
Angular had it right; React was fixed to match.

**What it costs.** Some behaviour is awkward to drive through accessible names
alone, and the driver is more complex than a selector-based one would be.
Accepted. The larger cost is that the rule is a convention a contributor can
break to unblock themselves, and the suite would then pass over unusable markup
for as long as nobody reads the diff. The driver-contract kit that would close
this — deliberately broken markup a driver must fail to find, plus an
accessibility-tree snapshot per fixture — is follow-up work.

**What it forecloses.** A fixture that cannot carry accessible names cannot
exist, because such a case could not run honestly. Since labels may be message
references ([0014](0014-presentation-sections.md)), the validator refuses a
reference that resolves nowhere as well: an unresolved id is exactly as
unfindable as no label. Option labels are held to the same standard: a driver
clicks a radio by the name beside it, not by its stored value.

## Alternatives considered

**Test ids.** Rejected: they make the suite pass over markup a person cannot
use, and they do it silently.

**A separate accessibility audit alongside the behaviour suite.** Rejected: it
is a workstream somebody schedules, and the first deadline deletes it.
