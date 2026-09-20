# 0012 — Pages scope nothing; groups and repeaters scope paths

- **Status:** accepted
- **Date:** 2026-09-19
- **Deciders:** Daniel Bacher
- **Verified by:** `modelDataPaths` is pinned by "lists data paths: pages
  transparent, groups nested, repeater rows marked" in
  `packages/spec/src/logic.test.ts`, and the consequence by the "diffSchemas and
  pages" block in `packages/spec/src/diff.test.ts`. The v0.1 refusals are
  covered by the two "rejects a repeater … inside a repeater" cases in
  `packages/spec/src/validate.test.ts` and the "pages are top-level only" block
  in `packages/spec/src/logic.test.ts`.

## Context

The path model is the one thing that cannot be changed later, because every
stored submission is written against it. Three container types exist — page,
group and repeater — and each had to decide whether it contributes to the data
path before any data existed.

## Decision

A **page** is presentation and contributes nothing, so a field on page 2 is
addressed as if pages did not exist. A **group** nests, contributing a dot
segment. A **repeater** contributes an indexed segment. One walk in
`packages/spec/src/paths.ts` states this, and the engine, `diffSchemas` and the
server all mirror it.

Adding, removing or reordering a page therefore never moves data. Reorganising
groups does, and `diffSchemas` ([0015](0015-diff-before-server.md)) reports it
as a removal plus an addition, because that is what happened to the submission
shape.

Repeaters were kept in v0.1 for exactly this reason. They determine the path
model, and deferring them would mean designing paths wrong and paying for it
across both renderers and the server simultaneously.

## Consequences

**What it buys.** Wizard layout becomes a free edit. An author can split a long
form into steps, or merge them back, without touching a stored answer and
without `diffSchemas` reporting anything. Data structure stays an explicit act:
you get nesting when you ask for a group.

**What it costs.** Nesting a repeater inside a repeater is refused by
`validateSchema` in v0.1, because the scoping rules for the inner one — what a
row index means two repeaters deep — were not worth settling yet. An author who
needs a table inside a table has to flatten it or wait. Nested pages are refused
for the related reason: a wizard step inside a data container is a step whose
fields the engine cannot count. That one was found while writing the builder's
`validTargets`, which decides legality by attempting the edit against the same
validator rather than by restating the rules.

**What it forecloses.** Pages can never carry data of their own — no per-page
object in the submission — because their transparency is what makes them free
to move.

## Alternatives considered

**Pages scope like groups.** Rejected: it would make repaginating a form a
breaking change to every submission already collected — the most common edit an
author makes, and the one they least expect to cost anything.

**Defer repeaters to v0.2.** Rejected: the path model cannot be revised once
data exists, and the repeater is the container that defines it.
