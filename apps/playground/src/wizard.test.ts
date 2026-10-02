import { describe, expect, test } from 'vitest'
import {
  CONTAINER_FIELD_TYPES,
  CURRENT_SPEC_VERSION,
  FIELD_TYPES,
  RULE_KINDS,
} from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FieldType, FormSchema, LogicRule } from '@formancy/spec'
import { STARTER_SCHEMA } from './starter.js'
import { WIZARD_SCHEMA } from './wizard.js'
import { PLAYGROUND_CHECKS } from './demo-checks.js'

/**
 * The second demo, and the reason there has to be one.
 *
 * `starter.ts` is one flat form on purpose — every field type the spec defines
 * **minus the two that nest**, so every control a visitor might want to try is on
 * screen at once. The cost of that was invisible until somebody asked: the
 * playground contained no `page` and no `group`, which means it never showed a
 * stepper, never showed a step being walked past, and gave the builder's
 * container commands — `p`, `u`, `w` — nothing to act on. Three releases of
 * wizard work were demonstrated nowhere.
 *
 * So the obligation is on the PAIR rather than on either document, and it is
 * derived from the spec's own lists: between the two of them, every field type
 * and every rule kind the format defines is on screen somewhere. Neither
 * document carries an exclusion list any more, which is what stops one going
 * stale the next time the format grows.
 */
const typesUsed = (fields: readonly FieldDef[]): Set<FieldType> => {
  const seen = new Set<FieldType>()
  const walk = (list: readonly FieldDef[]): void => {
    for (const field of list) {
      seen.add(field.type)
      if (field.fields !== undefined) walk(field.fields)
    }
  }
  walk(fields)
  return seen
}

const rulesOf = (schema: FormSchema): readonly LogicRule[] => schema.logic?.rules ?? []

const kindsUsed = (schema: FormSchema): Set<string> =>
  new Set(rulesOf(schema).map((rule) => rule.kind))

/** Every page key, in document order. */
const pageKeys = (schema: FormSchema): string[] =>
  schema.model.fields.filter((field) => field.type === 'page').map((field) => field.key)

describe('the wizard demo', () => {
  test('validates against the spec — a demo must never open on an error screen', () => {
    expect(validateSchema(WIZARD_SCHEMA)).toMatchObject({ valid: true })
  })

  test('declares the version its newest construct needs, whatever that is', () => {
    // Against the constant rather than a literal: a demo pinned to an older
    // version is a demo the builder correctly refuses to extend, which is how
    // three field types were once unreachable in the starter.
    expect(WIZARD_SCHEMA.specVersion).toBe(CURRENT_SPEC_VERSION)
  })

  test('holds every container type the format has, since that is what it is for', () => {
    const seen = typesUsed(WIZARD_SCHEMA.model.fields as readonly FieldDef[])

    // Derived from the spec's constant, so a container type added to the format
    // fails here until this demo shows it.
    for (const type of CONTAINER_FIELD_TYPES) expect([...seen]).toContain(type)
  })

  test('and between the two demos, every field type the format defines is on screen', () => {
    const together = new Set([
      ...typesUsed(STARTER_SCHEMA.model.fields as readonly FieldDef[]),
      ...typesUsed(WIZARD_SCHEMA.model.fields as readonly FieldDef[]),
    ])

    // No exclusion list on either side. The starter's own test says it covers
    // everything except `group` and `page`; this says the pair covers everything,
    // which is the claim a visitor can actually check.
    expect([...together].sort()).toEqual([...FIELD_TYPES].sort())
  })

  test('and every rule kind, which is the half that was missing entirely', () => {
    const together = new Set([...kindsUsed(STARTER_SCHEMA), ...kindsUsed(WIZARD_SCHEMA)])

    // `disabled`, `check` and `skip` were in no demo at all. `skip` could not be
    // — it names a page key and there was no page — and `check` needs the
    // deployment to answer it, which is the next case.
    expect([...together].sort()).toEqual([...RULE_KINDS].sort())
  })

  test('names only checks this playground actually answers', () => {
    // The documented-but-inert failure, in the one place it would be invisible.
    // A `check` naming a validator nothing answers fails CLOSED: the field shows
    // an error the visitor cannot clear and there is nothing on screen to say
    // that the deployment, not the answer, is what is missing.
    const named = rulesOf(WIZARD_SCHEMA)
      .filter((rule) => rule.kind === 'check')
      .map((rule) => rule.check)

    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(Object.keys(PLAYGROUND_CHECKS)).toContain(name)
  })

  test('skips a page on an answer given before it, which is the only place one can be', () => {
    const skips = rulesOf(WIZARD_SCHEMA).filter((rule) => rule.kind === 'skip')
    expect(skips.length).toBeGreaterThan(0)

    const pages = pageKeys(WIZARD_SCHEMA)
    for (const skip of skips) {
      const target = pages.indexOf(skip.target)
      // Not the first page: the condition has to be answerable before the step it
      // decides about, and nothing is answerable before step one.
      expect(target).toBeGreaterThan(0)

      // And the answers it reads are on an EARLIER page. A skip whose condition
      // read a field on the page being skipped could only ever be false when it
      // mattered — the validator permits it and the form would simply never skip,
      // which is a demo that shows the feature not working.
      const earlier = new Set<string>()
      for (const page of WIZARD_SCHEMA.model.fields.slice(0, target)) {
        for (const key of keysOf(page.fields ?? [])) earlier.add(key)
      }
      const read = [...(skip.cel ?? '').matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map((m) => m[0])
      const fields = read.filter((word) => allKeys(WIZARD_SCHEMA).has(word))
      expect(fields.length).toBeGreaterThan(0)
      for (const word of fields) expect([...earlier]).toContain(word)
    }
  })

  test('puts a repeater inside a step, which the flat demo cannot show', () => {
    // A row inside a page is where the two constructs meet: page validation on
    // "next" has to consider every row, and the starter's top-level repeater
    // never exercises that.
    const inPage = WIZARD_SCHEMA.model.fields
      .filter((field) => field.type === 'page')
      .some((page) => (page.fields ?? []).some((child) => child.type === 'repeater'))

    expect(inPage).toBe(true)
  })
})

/** Every key at one level. */
function keysOf(fields: readonly FieldDef[]): string[] {
  const out: string[] = []
  const walk = (list: readonly FieldDef[]): void => {
    for (const field of list) {
      out.push(field.key)
      if (field.fields !== undefined) walk(field.fields)
    }
  }
  walk(fields)
  return out
}

/** Every key in the document, for telling a field name from a CEL keyword. */
function allKeys(schema: FormSchema): Set<string> {
  return new Set(keysOf(schema.model.fields as readonly FieldDef[]))
}

describe('the wizard demo, run rather than read', () => {
  /*
   * Every case above checks the document's SHAPE, and a demo can have a perfect
   * shape and show the feature not working. This one did: `skip` was written
   * `!needsVisa`, which is how anybody would write it — and an untouched checkbox
   * is null, CEL refuses `!null`, and a rule that errors fails CLOSED. Measured
   * against a real engine: `skipped: false` for the visa page untouched, ticked
   * and unticked. Three states, one answer, and the shape was right in all of
   * them.
   *
   * So the demo's own claim is held by building an engine and asking it. The
   * engine's `skip.test.ts` uses `needsVisa != true`, which is the idiom that
   * works and the one this now uses.
   */
  const engine = (): ReturnType<typeof createFormEngine> =>
    createFormEngine({
      schema: WIZARD_SCHEMA,
      capabilities: { now: () => 0, today: () => '2026-09-29', random: () => 0.5 },
      checks: PLAYGROUND_CHECKS,
    })

  const skippedKeys = (form: ReturnType<typeof createFormEngine>): string[] =>
    form.pages().filter((page) => page.skipped).map((page) => page.key)

  test('skips the visa step while nobody has said they need a visa', () => {
    // The static text on step one says exactly this. It was false.
    expect(skippedKeys(engine())).toEqual(['visa'])
  })

  test('and stops skipping it the moment they say they do', () => {
    const form = engine()
    form.setValue(['needsVisa'], true)

    expect(skippedKeys(form)).toEqual([])
  })

  test('and skips it again when they change their mind, rather than sticking', () => {
    const form = engine()
    form.setValue(['needsVisa'], true)
    form.setValue(['needsVisa'], false)

    expect(skippedKeys(form)).toEqual(['visa'])
  })

  test('hides the canton notice until the address inside the group says Switzerland', () => {
    /*
     * The demo's only condition that reads INSIDE a group, and the reason it is
     * here rather than only in the document: `address.country` is the DATA path,
     * two levels down in the builder's tree, and a rule written against the tree
     * path — `country` — compiles and silently never fires, because the engine
     * types an unknown leaf as `dyn`.
     *
     * That is also exactly the state a rename used to leave behind, which is
     * what this rule is in the demo to show being fixed
     * ([0093](../../../docs/decisions/0093-a-rule-follows-the-path-it-reads.md)).
     *
     * And it needs `has(...)`, which this demo found by measuring rather than
     * by reading. All three states on a real engine: with the group untouched,
     * `address.country == "CH"` **errors** — the group is null, so the member
     * access fails before anything is compared — and a `visible` rule that
     * errors fails OPEN, so the notice was on screen from the start.
     * `address.country != null && ...` fails identically, because it has to
     * read the path to compare it. Asserted in all three directions below: a
     * condition false in every state looks exactly like one correctly false
     * now, and a condition TRUE in every state is how this was caught.
     */
    const form = engine()

    expect(form.getFieldSnapshot(['cantonNotice']).visible).toBe(false)
    form.setValue(['address', 'country'], 'CH')
    expect(form.getFieldSnapshot(['cantonNotice']).visible).toBe(true)
    form.setValue(['address', 'country'], 'DE')
    expect(form.getFieldSnapshot(['cantonNotice']).visible).toBe(false)
  })

  test('disables the notes until somebody asks for them', () => {
    // The same null-versus-`!` trap, on the other rule kind in this document: it
    // would have shipped as a disabled rule that never disabled anything.
    const form = engine()

    expect(form.getFieldSnapshot(['notes']).disabled).toBe(true)
    form.setValue(['addNotes'], true)
    expect(form.getFieldSnapshot(['notes']).disabled).toBe(false)
  })

  test('and its check refuses a reference this deployment does not know', async () => {
    const form = engine()
    form.setValue(['reference'], 'nonsense')
    // Touched, as the renderer does when the control is left: an answer
    // nobody has finished giving is not one to go and ask a server about.
    form.touch(['reference'])
    await form.settle()

    expect(form.getFieldSnapshot(['reference']).errors).toContain('unknownReference')
  })

  test('while accepting one it does', async () => {
    const form = engine()
    form.setValue(['reference'], 'FM-1234')
    // Touched, as the renderer does when the control is left: an answer
    // nobody has finished giving is not one to go and ask a server about.
    form.touch(['reference'])
    await form.settle()

    expect(form.getFieldSnapshot(['reference']).errors).toEqual([])
  })
})
