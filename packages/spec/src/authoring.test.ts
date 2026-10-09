import { describe, expect, test } from 'vitest'

import schema from '../formancy.schema.json' with { type: 'json' }
import { DECLINE_KEY, authoringBriefing, authoringFacts } from './authoring.js'
import {
  CURRENT_SPEC_VERSION,
  FIELD_TYPES,
  SPEC_1_FIELD_TYPES,
  WIDGETS_BY_FIELD_TYPE,
} from './types.js'

/**
 * The briefing a language model is given before it writes a document.
 *
 * It had no test, and it was wrong: `layoutKinds` was written as spec 1's kinds plus
 * `tabs` and `table`, so `qrcode` was missing from the one list a model reads to find
 * out what exists. A model cannot check the schema — the briefing is its whole picture
 * of the format — so a gap here is a construct nobody will ever be told about.
 *
 * Everything below derives both sides: the facts from `authoringFacts`, the truth from
 * the document schema and the type lists. A construct added to the format fails this
 * until the briefing names it.
 */

type SchemaShape = {
  $defs: Record<
    string,
    {
      oneOf?: Array<{
        const?: string
        properties?: { kind?: { const?: string; enum?: string[] }; format?: { oneOf?: Array<{ const: string }> } }
      }>
      properties?: Record<string, { oneOf?: Array<{ const: string }> }>
    }
  >
}

const defs = (schema as unknown as SchemaShape).$defs

/** Every `kind` a layout node may carry, from the branches that declare them. */
function layoutKindsInSchema(): string[] {
  const kinds: string[] = []
  for (const branch of defs['layoutNode']?.oneOf ?? []) {
    const kind = branch.properties?.kind
    if (kind?.const !== undefined) kinds.push(kind.const)
    for (const one of kind?.enum ?? []) kinds.push(one)
  }
  return kinds
}

describe('the facts a model is briefed with', () => {
  test('names every layout kind the format has', () => {
    // The failure this prevents, and it had already happened: `qrcode` shipped as a
    // layout kind and the briefing still listed spec 1's kinds plus two. A model told
    // that list writes no code node ever, and a document that contains one looks to it
    // like a mistake.
    expect([...authoringFacts().layoutKinds].sort()).toEqual([...layoutKindsInSchema()].sort())
    // A guard on the guard: an empty schema walk would agree with an empty list.
    expect(layoutKindsInSchema().length).toBeGreaterThan(5)
  })

  test('names every field type the format has, and says which ones version 1 allows', () => {
    expect(authoringFacts().fieldTypes).toEqual(FIELD_TYPES)
    expect(authoringFacts().fieldTypesInSpec1).toEqual(SPEC_1_FIELD_TYPES)
  })

  test('names every rule kind and every format, from the schema rather than by hand', () => {
    const ruleKinds = (defs['logicRule']?.properties?.['kind']?.oneOf ?? []).map(
      (one) => one.const,
    )
    expect([...authoringFacts().ruleKinds].sort()).toEqual([...ruleKinds].sort())
    expect(ruleKinds.length).toBeGreaterThan(3)

    const formats = findFormats()
    expect([...authoringFacts().formats].sort()).toEqual([...formats].sort())
    expect(formats.length).toBeGreaterThan(0)
  })

  test('names every widget, under the type that accepts it', () => {
    // A model that has not been told widgets exist writes `type: "toggle"` and gets a
    // refusal naming a type that is not one. It cannot look the vocabulary up: this
    // briefing is its whole picture of the format.
    expect(authoringFacts().widgetsByFieldType).toEqual(WIDGETS_BY_FIELD_TYPE)
    expect(Object.keys(WIDGETS_BY_FIELD_TYPE).length).toBeGreaterThan(0)
  })

  test('is on the version the code implements', () => {
    // A briefing naming an older version would have a model write documents that the
    // validator refuses for a construct the same briefing recommended.
    expect(authoringFacts().currentSpecVersion).toBe(CURRENT_SPEC_VERSION)
  })
})

describe('the note about what version 1 may not carry', () => {
  test('names every construct that needs version 2', () => {
    // The whole point of the note: a model that writes `specVersion: "1"` with a
    // version 2 construct gets the document refused outright, because the schema is
    // closed. The note listed five constructs and there are more than five.
    const note = authoringFacts().notes.find((line) => line.includes('version 2'))
    expect(note, 'no note explains the version line').toBeDefined()

    const added = [
      // Widened to `string`: `SPEC_1_FIELD_TYPES` is narrower than `FIELD_TYPES`, so
      // `includes` refuses the argument it exists to be asked about.
      ...FIELD_TYPES.filter((type) => !(SPEC_1_FIELD_TYPES as readonly string[]).includes(type)),
      ...layoutKindsInSchema().filter(
        (kind) => !['field', 'section', 'row', 'column'].includes(kind),
      ),
    ]
    expect(added.filter((name) => !(note ?? '').includes(name))).toEqual([])
  })

  test('names the PROPERTIES too, which are the half that surprises people', () => {
    // `widget`, a temporal bound and `optionsSource` are not types, and a version 1
    // reader refuses the whole document over any of them rather than ignoring it.
    const text = authoringFacts().notes.join(' ')
    for (const property of ['widget', 'optionsSource', 'earliest']) {
      expect(text, `no note mentions \`${property}\``).toContain(property)
    }
  })
})

describe('the briefing itself', () => {
  test('carries every fact, so the prose and the data cannot disagree', () => {
    // The briefing is the thing that is actually sent. Facts that never reach it are
    // facts nobody is told, which is the same failure as not having them.
    const briefing = authoringBriefing()
    const facts = authoringFacts()

    for (const type of facts.fieldTypes) expect(briefing).toContain(type)
    for (const kind of facts.layoutKinds) expect(briefing).toContain(kind)
    for (const widgets of Object.values(facts.widgetsByFieldType)) {
      for (const widget of widgets) expect(briefing).toContain(widget)
    }
    for (const note of facts.notes) expect(briefing).toContain(note)
    expect(briefing).toContain(facts.currentSpecVersion)
  })

  test('tells the model to answer with the document and nothing else', () => {
    // Without it a model returns a code fence and a paragraph of explanation, and the
    // caller parses the paragraph as JSON.
    expect(authoringBriefing()).toMatch(/nothing else/i)
  })

  test('shows how to decline, as an object whose only key is DECLINE_KEY', () => {
    /*
     * Asked for something no document can say — "email me every submission" — a
     * model had no answer but a document, and wrote one that failed the checks on
     * every attempt. The briefing offers a decline instead, and the example it shows
     * is what a model copies: spelled with any other key, or with a second one, it
     * is read as a document that failed, and the run goes on asking.
     *
     * Read out of the briefing as JSON rather than matched as wording, so it holds
     * for whatever sentence surrounds the example.
     */
    const objects = [...authoringBriefing().matchAll(/\{[^{}]*\}/g)].flatMap(([candidate]) => {
      try {
        const parsed: unknown = JSON.parse(candidate)
        return typeof parsed === 'object' && parsed !== null ? [parsed as Record<string, unknown>] : []
      } catch {
        return []
      }
    })
    const declines = objects.filter((object) => DECLINE_KEY in object)

    expect(declines).toHaveLength(1)
    expect(Object.keys(declines[0] ?? {})).toEqual([DECLINE_KEY])
    expect(typeof declines[0]?.[DECLINE_KEY]).toBe('string')
    expect(String(declines[0]?.[DECLINE_KEY]).trim()).not.toBe('')
  })
})

/** The closed format list, found wherever `format` is declared in a field. */
function findFormats(): string[] {
  const walk = (node: unknown): string[] | undefined => {
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = walk(entry)
        if (found !== undefined) return found
      }
      return undefined
    }
    if (typeof node !== 'object' || node === null) return undefined
    const record = node as Record<string, unknown>
    const properties = record['properties'] as Record<string, unknown> | undefined
    const format = properties?.['format'] as { oneOf?: Array<{ const: string }> } | undefined
    if (format?.oneOf !== undefined) return format.oneOf.map((one) => one.const)
    for (const value of Object.values(record)) {
      const found = walk(value)
      if (found !== undefined) return found
    }
    return undefined
  }
  return walk(defs['field']) ?? []
}
