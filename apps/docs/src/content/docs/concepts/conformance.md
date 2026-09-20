---
title: Conformance
description: One behaviour suite, many renderers — and why a renderer that cannot be queried by accessible name fails it.
---

formancy ships more than one renderer. The obvious risk is that they drift: a
fix lands in React, Angular keeps the bug, and nobody notices for months.
`@formancy/conformance` exists to make that impossible.

## One suite, N drivers

A behaviour is written down **once**, as data:

```jsonc
{
  "name": "a conditional field appears when its condition turns true",
  "schema": { /* a real form */ },
  "steps": [
    { "set": { "country": "CH" } },
    { "expectVisible": ["canton"] },
    { "expectHidden": ["state"] },
    { "submit": true },
    { "expectErrors": { "canton": ["required"] } }
  ]
}
```

The same file then runs against the engine in Node, the engine in a browser, the
React renderer, the Angular renderer and the server's revalidation endpoint.
Write it once, verify it in five places.

A renderer adapts itself to the suite through a small driver interface —
`mount`, `fill`, `activate`, `visibleFields`, `valueOf`, `errorsFor`,
`currentPage`, `ariaSnapshot`, `submit` — and then:

```ts
import { describeConformance } from '@formancy/conformance'
import { describe, test } from 'vitest'

describeConformance(() => createMyDriver(), { test: { describe, test } })
```

The test framework is passed as data rather than imported, so the suite runs
under Vitest, Jest or Jasmine without the package depending on any of them.

## The rule

> **A driver resolves a field by accessible name and role. Nothing else.**

`getByRole('textbox', { name })`, `getByLabelText(name)`. Never a test id, never
a CSS selector, never a component instance.

The consequence is the entire point: **a renderer whose markup cannot be queried
by role and accessible name fails conformance.** An input with no label, a
combobox built from unlabelled divs, an error message not associated with its
control — none of them can be driven, so none of them can pass. Accessibility
stops being a workstream somebody schedules and becomes a structural property of
a passing test run.

There will be a moment when a renderer is awkward to query and `data-testid`
looks like the pragmatic unblock. That escape hatch deletes the guarantee: the
suite would then pass over markup no screen reader can use, and it would keep
passing for years. If a control cannot be found by name and role, the bug is in
the renderer.

The fixture format backs this up mechanically — a case whose visible fields lack
labels is rejected by the validator, so every runnable case *carries* the
accessible names a driver must resolve by.

## What the shipped fixtures cover

Six cases, each encoding semantics the engine must implement:

| Fixture | What it pins |
| --- | --- |
| required field | submit blocked until a value exists |
| conditional visibility | a field appears and disappears with its condition |
| calculated value | a computed field tracks its inputs |
| clear on hide | whether a hidden field's answer is dropped or kept |
| repeating group | per-row validation, and re-indexing when a row is removed |
| wizard page validation | next validates only the current page; submit validates everything and returns to the first page with a problem |

## Failures are meant to be read by strangers

A failure names the fixture, the step index, expected versus actual, and
attaches an accessibility-tree snapshot taken at the moment it failed — because
the person reading it is usually debugging a renderer they did not write and
cannot see the screen. A driver that *throws* is reported as a crash, distinct
from an assertion failure: one means the renderer behaves differently, the other
means it broke.

## Certifying your own renderer

The package is published for exactly this. Implement the driver, run
`describeConformance`, and you have the same evidence the built-in renderers
have — that a Vue, Svelte or Solid renderer really does behave like the others,
rather than merely looking like it does.

Skips are deliberately loud: a skipped case either registers through the test
framework's own skip, or fails. A renderer must not be able to advertise
conformance it does not have.
