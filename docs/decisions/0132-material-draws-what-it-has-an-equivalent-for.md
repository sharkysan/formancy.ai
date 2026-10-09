# 0132 — Angular Material draws what it has an equivalent for, and is held to the same fixtures

- **Status:** accepted
- **Date:** 2026-10-09
- **Verified by:** `packages/angular/material/src/conformance.test.ts` — the conformance
  fixtures every renderer is held to, through the same Angular driver, with
  `provideFormancyMaterial()` added: every control found by role and accessible name, values,
  visibility, errors, wizard steps and an axe audit after every step. Removing the
  error-state refresh, or the decorator that makes its query one, or passing the engine's
  error id to Material as well as Material's own, each fails it.
  `packages/angular/material/src/controls.test.ts` — the types no fixture uses (date, time),
  each Material control inside Material and found by its name, values stored as the defaults
  store them (ticks in the options' order), every variant Material cannot draw drawn by the
  default control instead, Material's asterisk leaving the name the field's name, an error
  described once under the engine's id, and the error summary's link landing on Material's
  checkbox. `packages/{angular,react}/src/focus-control.test.ts` — focus moves into a host
  that cannot take it; removing that fails both and the summary case.
- **Deciders:** Daniel Bacher

## Context

The backlog asked for an Angular Material adapter. The renderer already had the seam for
one — a registry the form reads by field type, which a design system fills with its own
components — and nothing in the repository had used it for a real design system.

Two things decide whether such an adapter is worth shipping. It must not quietly change
what a form collects or how it can be operated, and the claim that it does not must rest on
the same evidence the default controls rest on — the shared conformance fixtures, driven by
accessible name ([0033](0033-one-suite-n-drivers.md),
[0034](0034-accessible-name-only.md)).

## Decision

**A secondary entry point, `@formancy/angular/material`, not a package.** The Angular driver
lives in `@formancy/angular`, and the registry token the adapter provides must be the one the
form reads. As a separate package, its tests would load the renderer from `dist` and the
driver from source — two `FORMANCY_REGISTRY` tokens, and nothing Material drew would ever be
asked for. As an entry point of the same package, the conformance suite drives the Material
controls with one provider added. `@angular/material` and `@angular/cdk` are optional peers:
only an application importing `/material` installs them.

**Material draws what it has an equivalent for, and nothing else.** Text, paragraph, number,
date and time are a `matInput` in `<mat-form-field>`; a list is the platform's `<select>`
under `matNativeControl` — not `mat-select`, which is a combobox over an overlay, a different
control with different keys; a tick, a group of radios and a group of ticks are Material's,
which keep a native input inside. A mask, a scanner, a rating or slider, a typeahead, a
tag picker, a list from a source, a picture on an option, a date-time, a file, a signature —
the default control draws those, so a design system never makes a feature disappear. The
value handling is the default controls', line for line.

**The engine keeps the decisions Material would otherwise make.** Errors: `matInput` decides
its error state with an `ErrorStateMatcher` over Angular forms, re-checked in `ngDoCheck` only
when an `NgControl` is present — with none, it stayed false and no error was ever shown,
measured. The matcher asks the engine (invalid and touched), and the controls ask Material to
re-check whenever the engine's verdict changes. Descriptions: Material adds the id of the
`mat-error` it shows to `aria-describedby`, so it is given the engine's ids without the
error's, and the `mat-error` carries the engine's error id — described once, not twice.
Identity: the engine's ids stay the control ids, including where Material puts them on a
host; `focusControl` in both renderers now moves focus into a host that cannot take it, which
is what makes the error summary's link land on Material's checkbox.

## Consequences

**One place the two differ, and it is Material's.** Material never marks an *empty* required
field `aria-invalid`, so it is not announced as invalid before anything was typed; the default
control marks it once the form has been submitted. The error is the field's description
either way.

**Material's asterisk stays.** It is CSS on an empty `aria-hidden` element, so the label's text
and the accessible name are the field's name. A first draft hid it, assuming the star was text;
measured on Material 22, it is not.

**Styling is Material's theme.** The adapter ships no CSS, as no package below the theme layer
does; an application includes a Material theme as it would for any Material component. The
formancy themes style the default controls, and the controls drawn by fallback keep their
`data-formancy-part` hooks.

**The fixtures do not use every type.** Date and time have no fixture; they are covered by the
adapter's own tests, and a fixture for them would hold every renderer to them.

## Alternatives considered

**A separate `@formancy/angular-material` package.** The conventional shape — and the one that
would have tested Material against a second copy of the renderer's tokens, or required the
driver to be published.

**`mat-select` and Material's datepicker.** Closer to what Material users see elsewhere. The
select is a different control, and the datepicker converts a calendar day through a `Date`,
which is how a day becomes the day before in half the world.

**Hiding Material's error and drawing the default one.** It would keep the default markup and
defeat the point of the adapter: Material's error is part of what a Material form looks like.
