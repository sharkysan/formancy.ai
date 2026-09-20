<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/conformance

The behaviour and accessibility contract every formancy renderer is held to —
one suite of fixtures, any number of drivers.

Published so that a renderer this project did not write can prove it behaves
like the ones it did.

## The rule

> **A driver resolves a field by accessible name and role. Nothing else.**

`getByRole`, `getByLabelText`. Never a test id, never a CSS selector, never a
component instance.

The consequence is the reason the package exists: a renderer whose markup cannot
be queried by role and accessible name **fails conformance**. An unlabelled
input, a combobox built from divs, an error message not associated with its
control — none can be driven, so none can pass. Accessibility becomes a
structural property of a passing test run rather than a workstream somebody
schedules.

The fixture format enforces this from the other side: a case whose visible
fields lack labels is rejected, so every runnable case carries the accessible
names a driver must resolve by.

## Use

```ts
import { describeConformance } from '@formancy/conformance'
import { describe, test } from 'vitest'

describeConformance(() => createMyDriver(), { test: { describe, test } })
```

The test framework is passed as data, not imported, so the suite runs under
Vitest, Jest or Jasmine without this package depending on any of them.

A failure names the fixture, the step index, expected versus actual, and an
accessibility-tree snapshot from the moment it failed — the reader is usually
debugging a renderer they did not write. A driver that throws is reported as a
crash, distinct from an assertion failure.

Skips are loud: they register through the framework's own skip or they fail. A
renderer must not be able to advertise conformance it does not have.

Docs: `apps/docs` (Concepts → Conformance).
