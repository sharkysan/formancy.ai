import { getConformanceSuite } from '@bufbuild/cel-spec/testdata/tests.js'
import { describe, expect, test } from 'vitest'
import { captureCapabilities } from './capabilities.js'
import { compile } from './compile.js'
import { evaluate } from './evaluate.js'
import type { DeclaredType, VariableDeclarations } from './types.js'

/**
 * The OFFICIAL CEL conformance corpus, run through formancy's public facade.
 *
 * The design notes flagged this as a day-one task and it had never been done:
 * the CEL implementation we wrap claims "most of the spec" with no published
 * score. This file turns that claim into a number a human reviews.
 *
 * It is deliberately honest about scope. Whole groups are excluded because
 * formancy does not expose the surface they test (protobuf messages, enums,
 * extension libraries) — and every exclusion is COUNTED under a stated reason
 * rather than quietly skipped, so the coverage claim cannot drift into
 * "we pass everything we bothered to run".
 */

/** Groups whose subject matter formancy actually exposes to form authors. */
const INCLUDED_GROUPS = new Set([
  'basic',
  'comparisons',
  'conversions',
  'fp_math',
  'integer_math',
  'lists',
  'logic',
  'macros',
  'macros2',
  'parse',
  'string',
])

const GROUP_EXCLUSIONS: Record<string, string> = {
  proto2: 'protobuf messages — not a formancy value type',
  proto2_ext: 'protobuf messages — not a formancy value type',
  proto3: 'protobuf messages — not a formancy value type',
  enums: 'protobuf enums — not a formancy value type',
  fields: 'protobuf field selection — not a formancy value type',
  namespace: 'protobuf containers — formancy declares a flat variable env',
  plumbing: 'checker/runtime plumbing, not language surface',
  dynamic: 'protobuf Any/JSON dynamic dispatch',
  bindings_ext: 'extension library formancy does not register',
  block_ext: 'extension library formancy does not register',
  encoders_ext: 'extension library formancy does not register',
  math_ext: 'extension library formancy does not register',
  optionals: 'optional types — not part of the formancy expression surface',
}

interface CorpusCase {
  group: string
  section: string
  name: string
  expr: string
  bindings: Record<string, unknown>
  expected: unknown
  disableCheck: boolean
  checkOnly: boolean
  container: string
  typeEnvSize: number
}

type Outcome =
  | { kind: 'passed' }
  | { kind: 'failed'; detail: string }
  | { kind: 'excluded'; reason: string }
  /** Refused by formancy's own safety policy rather than by CEL semantics —
   *  the structural limits doing their job. Counted apart from failures,
   *  because passing these would mean the limits were not working. */
  | { kind: 'refusedByPolicy'; code: string }

const CAPABILITIES = captureCapabilities({
  now: () => 1_767_225_600_000,
  today: () => '2026-01-01',
  random: () => 0.5,
})

/* eslint-disable @typescript-eslint/no-explicit-any */

// This package compiles without DOM or Node libs on purpose, so `console` is
// not in scope. Declared here rather than widening the lib: the audit prints
// its breakdown for a human, and the purity rule stays intact for the library.
declare const console: { log(...args: unknown[]): void }

function collectCases(): CorpusCase[] {
  const cases: CorpusCase[] = []
  const suite: any = corpus

  const walk = (node: any, group: string, section: string[]): void => {
    for (const child of node.suites ?? []) {
      walk(child, group === '' ? child.name : group, group === '' ? [] : [...section, child.name])
    }
    for (const entry of node.tests ?? []) {
      const original = entry.original ?? entry
      cases.push({
        group,
        section: section.join('/'),
        name: original.name ?? entry.name ?? '?',
        expr: original.expr ?? '',
        bindings: original.bindings ?? {},
        expected: original.resultMatcher,
        disableCheck: original.disableCheck === true,
        checkOnly: original.checkOnly === true,
        container: original.container ?? '',
        typeEnvSize: (original.typeEnv ?? []).length,
      })
    }
  }
  walk(suite, '', [])
  return cases
}

/** A protobuf Value to a plain JS value, or `unsupported`. */
const UNSUPPORTED = Symbol('unsupported')

function toJs(value: any): unknown {
  const kind = value?.kind
  if (kind === undefined) return UNSUPPORTED
  switch (kind.case) {
    case 'nullValue':
      return null
    case 'boolValue':
      return kind.value
    case 'stringValue':
      return kind.value
    case 'int64Value':
    case 'uint64Value':
      return Number(kind.value)
    case 'doubleValue':
      return kind.value
    case 'listValue': {
      const items = (kind.value?.values ?? []).map(toJs)
      return items.some((item: unknown) => item === UNSUPPORTED) ? UNSUPPORTED : items
    }
    case 'mapValue': {
      const out: Record<string, unknown> = {}
      for (const entry of kind.value?.entries ?? []) {
        const key = toJs(entry.key)
        const mapped = toJs(entry.value)
        if (typeof key !== 'string' || mapped === UNSUPPORTED) return UNSUPPORTED
        out[key] = mapped
      }
      return out
    }
    default:
      return UNSUPPORTED
  }
}

function declaredTypeOf(value: unknown): DeclaredType | undefined {
  if (value === null) return 'dyn'
  switch (typeof value) {
    case 'boolean':
      return 'bool'
    case 'string':
      return 'string'
    case 'number':
      return Number.isInteger(value) ? 'int' : 'double'
    case 'object':
      return Array.isArray(value) ? 'list' : 'map'
    default:
      return undefined
  }
}

/** Numbers compare loosely across int/double, as CEL's own value model does. */
function sameValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'bigint') return sameValue(Number(actual), expected)
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Object.is(actual, expected) || Math.abs(actual - expected) < 1e-9
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((item, i) => sameValue(item, expected[i]))
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object'
  ) {
    const a = actual as Record<string, unknown>
    const b = expected as Record<string, unknown>
    const keys = Object.keys(b)
    return (
      Object.keys(a).length === keys.length && keys.every((key) => sameValue(a[key], b[key]))
    )
  }
  return Object.is(actual, expected)
}


/** Limit and policy codes mean "formancy refused", not "CEL disagreed". */
function isPolicyRefusal(code: string): boolean {
  return /limit|exceeded|depth|too_|forbidden|not_allowed/.test(code)
}

function runCase(entry: CorpusCase): Outcome {
  const groupReason = GROUP_EXCLUSIONS[entry.group]
  if (groupReason !== undefined) return { kind: 'excluded', reason: groupReason }
  if (!INCLUDED_GROUPS.has(entry.group)) {
    return { kind: 'excluded', reason: 'group outside the surface formancy exposes' }
  }
  if (entry.container !== '') {
    return { kind: 'excluded', reason: 'protobuf container — formancy declares a flat env' }
  }
  if (entry.typeEnvSize > 0) {
    return { kind: 'excluded', reason: 'declares a proto type env formancy does not model' }
  }
  if (entry.checkOnly) {
    return { kind: 'excluded', reason: 'check-only case; formancy checks through its own env' }
  }

  // Types CEL has and formancy deliberately does not expose to form authors.
  // A form value is JSON; unsigned 64-bit integers and byte strings are not.
  if (/\b\d+u\b/.test(entry.expr) || /\buint\(/.test(entry.expr)) {
    return { kind: 'excluded', reason: 'uint — not a formancy value type' }
  }
  if (/\bbytes\(/.test(entry.expr) || /\bb["']/.test(entry.expr)) {
    return { kind: 'excluded', reason: 'bytes — not a formancy value type' }
  }
  if (/\bduration\(|\btimestamp\(/.test(entry.expr)) {
    return { kind: 'excluded', reason: 'duration/timestamp literals — bound through the value boundary, not expressions' }
  }

  const expectedCase = (entry.expected as any)?.case
  if (expectedCase !== 'value' && expectedCase !== 'evalError') {
    return { kind: 'excluded', reason: `result matcher "${String(expectedCase)}" not modelled` }
  }

  const variables: Record<string, DeclaredType> = {}
  const bag: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(entry.bindings)) {
    const bound = toJs((raw as any)?.kind?.case === 'value' ? (raw as any).value : raw)
    if (bound === UNSUPPORTED) {
      return { kind: 'excluded', reason: 'binding uses a value type formancy does not accept' }
    }
    const declared = declaredTypeOf(bound)
    if (declared === undefined) {
      return { kind: 'excluded', reason: 'binding uses a value type formancy does not accept' }
    }
    variables[name] = declared
    bag[name] = bound
  }

  const compiled = compile(entry.expr, {
    kind: 'computed',
    variables: variables as VariableDeclarations,
  })

  if (!compiled.ok && isPolicyRefusal(compiled.error.code)) {
    return { kind: 'refusedByPolicy', code: compiled.error.code }
  }

  if (expectedCase === 'evalError') {
    if (!compiled.ok) return { kind: 'passed' }
    const outcome = evaluate(compiled.program, bag, { capabilities: CAPABILITIES })
    return outcome.ok
      ? { kind: 'failed', detail: `expected an error, got ${String(outcome.value)}` }
      : { kind: 'passed' }
  }

  const expected = toJs((entry.expected as any).value)
  if (expected === UNSUPPORTED) {
    return { kind: 'excluded', reason: 'expected value uses a type formancy does not produce' }
  }

  if (!compiled.ok) return { kind: 'failed', detail: `compile: ${compiled.error.code}` }
  const outcome = evaluate(compiled.program, bag, { capabilities: CAPABILITIES })
  if (!outcome.ok) return { kind: 'failed', detail: `evaluate: ${outcome.error.code}` }
  return sameValue(outcome.value, expected)
    ? { kind: 'passed' }
    : { kind: 'failed', detail: `got ${JSON.stringify(String(outcome.value))}, want ${JSON.stringify(String(expected))}` }
}

const corpus = await getConformanceSuite()
const cases = collectCases()
const results = cases.map((entry) => ({ entry, outcome: runCase(entry) }))

const passed = results.filter((r) => r.outcome.kind === 'passed')
const failed = results.filter((r) => r.outcome.kind === 'failed')
const excluded = results.filter((r) => r.outcome.kind === 'excluded')
const refused = results.filter((r) => r.outcome.kind === 'refusedByPolicy')

describe('the official CEL conformance corpus', () => {
  test('the corpus loads and is the size we think it is', () => {
    // A corpus that silently shrank would make every count below meaningless.
    expect(cases.length).toBeGreaterThan(1000)
  })

  test('every case is classified — nothing is silently skipped', () => {
    expect(passed.length + failed.length + excluded.length + refused.length).toBe(cases.length)
  })

  test('the run is deterministic', () => {
    const second = cases.map((entry) => runCase(entry).kind)
    expect(second).toEqual(results.map((r) => r.outcome.kind))
  })

  test('COUNTS (a change here is a review item, not a silent drift)', () => {
    const summary = {
      total: cases.length,
      run: passed.length + failed.length,
      passed: passed.length,
      failed: failed.length,
      refusedByPolicy: refused.length,
      excluded: excluded.length,
    }
    // Printed so a reviewer sees the shape even when the assertion passes.
    console.log('CEL corpus:', JSON.stringify(summary))
    const codes: Record<string, number> = {}
    for (const f of failed) {
      const detail = (f.outcome as { detail: string }).detail
      const code = detail.replace(/^(compile|evaluate): /, '').split(',')[0]!.slice(0, 40)
      codes[code] = (codes[code] ?? 0) + 1
    }
    console.log('CEL corpus failure classes:', JSON.stringify(codes, null, 1))

    // The three classes worth watching. `unknown_variable` dominating is the
    // signal that formancy checks identifiers when an author SAVES rather than
    // when a user submits — losing that would be a regression, not a fix.
    expect(codes['unknown_variable']).toBe(50)
    expect(codes['int_out_of_range']).toBe(3)
    expect(
      (codes['heterogeneous_list_element'] ?? 0) +
        (codes['heterogeneous_map_value'] ?? 0) +
        (codes['heterogeneous_map_key'] ?? 0),
    ).toBe(19)
    console.log(
      'CEL corpus sample failures:',
      JSON.stringify(
        failed.slice(0, 12).map((f) => ({
          group: f.entry.group,
          name: f.entry.name,
          expr: f.entry.expr.slice(0, 48),
          detail: (f.outcome as { detail: string }).detail.slice(0, 48),
        })),
        null,
        1,
      ),
    )
    console.log(
      'CEL corpus failures by group:',
      JSON.stringify(
        Object.fromEntries(
          [...new Set(failed.map((f) => f.entry.group))].map((group) => [
            group,
            failed.filter((f) => f.entry.group === group).length,
          ]),
        ),
      ),
    )

    // PINNED. These numbers are the audit's result; a change to any of them is
    // a review item, not a silent drift. See CEL-CONFORMANCE.md for what each
    // failure class means and why most of them are formancy being stricter
    // than CEL on purpose rather than failing to implement it.
    expect(summary).toEqual({
      total: 2344,
      run: 704,
      passed: 586,
      failed: 118,
      refusedByPolicy: 2,
      excluded: 1638,
    })

    // Of what we run, five in six pass; the rest are the classes documented in
    // CEL-CONFORMANCE.md, dominated by compile-time strictness formancy wants.
    expect(summary.passed / summary.run).toBeGreaterThan(0.83)
  })

  test('no included group is entirely unrun — that would be a silent hole', () => {
    for (const group of INCLUDED_GROUPS) {
      const ran = results.filter(
        (r) => r.entry.group === group && r.outcome.kind !== 'excluded',
      ).length
      expect({ group, ran }).toEqual({ group, ran: expect.any(Number) })
      expect(ran).toBeGreaterThan(0)
    }
  })
})
