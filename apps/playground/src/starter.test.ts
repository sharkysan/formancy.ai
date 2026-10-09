import { describe, expect, test } from 'vitest'
import { unreferencedPaths } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'
import { CONTAINER_FIELD_TYPES, CURRENT_SPEC_VERSION, FIELD_TYPES, FIELD_WIDGETS } from '@formancy/spec'
import type { FieldDef, FieldType } from '@formancy/spec'
import { compileGroup } from '@formancy/builder-core'
import type { ConditionGroup } from '@formancy/builder-core'
import { STARTER_SCHEMA } from './starter.js'

describe('the starter schema', () => {
  test('validates against the spec — the demo must never open on an error screen', () => {
    const result = validateSchema(STARTER_SCHEMA)
    expect(result).toMatchObject({ valid: true })
  })

  /**
   * The demo's own claim, enforced.
   *
   * The intro used to say "every field type the spec defines" while the
   * document declared `specVersion: '1'` — so `selectboxes`, `file` and
   * `richtext` were not in it and could not be, and the builder correctly
   * refused to add one. The form advertised everything and the palette said
   * no. Nothing failed: the demo simply did not contain what it said it did,
   * and only somebody going looking for a rich text field would find out.
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

  /**
   * Widgets the demo does not show yet, and why.
   *
   * A list rather than a silence, on the same reasoning as the deliberately-unstyled
   * parts in `apps/docs/src/themes.test.ts`: an exception nobody records is an
   * exception nobody removes. Putting a widget in the demo before its control exists
   * would be worse than leaving it out — the document would be valid, the renderer
   * would fall back to the default control, and a visitor could not tell which they
   * were looking at. That is the documented-but-inert failure this repository has
   * shipped once already.
   *
   * Delete an entry when its control lands. The test below fails on a name that is no
   * longer a widget at all, so the list cannot rot in the other direction.
   */
  const NOT_DEMONSTRATED_YET: Readonly<Record<string, string>> = {
    // Empty, and it has been every entry in turn: `toggle`, then `scanner`, then
    // `typeahead`, and `datagrid` last. Kept rather than deleted, because the next
    // widget to be named before its control exists needs somewhere honest to sit.
  }

  test('demonstrates every widget, or says why not', () => {
    // A widget the playground does not show is a widget nobody sees working, which is
    // the whole reason the demo exists.
    const widgetsUsed = new Set<string>()
    const walk = (fields: readonly FieldDef[]): void => {
      for (const field of fields) {
        if (typeof field.widget === 'string') widgetsUsed.add(field.widget)
        if (field.fields !== undefined) walk(field.fields)
      }
    }
    walk(STARTER_SCHEMA.model.fields as readonly FieldDef[])

    const missing = FIELD_WIDGETS.filter(
      (widget) => !widgetsUsed.has(widget) && NOT_DEMONSTRATED_YET[widget] === undefined,
    )
    expect(missing).toEqual([])

    // A guard on the guard: an empty widget list would pass forever.
    expect(FIELD_WIDGETS.length).toBeGreaterThan(0)
  })

  test('the not-yet-demonstrated list names only real widgets', () => {
    // So the list cannot outlive the widget it excuses.
    const real = new Set<string>(FIELD_WIDGETS)
    expect(Object.keys(NOT_DEMONSTRATED_YET).filter((widget) => !real.has(widget))).toEqual([])
  })

  test('places every field it declares, in every layout it offers', () => {
    // The bug this exists for, reported by somebody looking at the running playground:
    // two temporal fields were added to the model and to the message catalogue and NOT
    // to the layout, so the form rendered without them and nothing failed. A field
    // missing from the one layout a form uses is invisible to everyone filling it in —
    // which is why `unreferencedPaths` was written, and it had no caller anywhere.
    //
    // A layout is allowed to leave fields out in general: a print layout that omits the
    // consent checkbox is doing its job. The demo is not that case — it exists to show
    // every field — so here the rule is total.
    // A `hidden` field is the one legitimate exception, and the guard found it on its
    // first run: `source` travels with the submission and is never shown, and
    // `DEFAULT_COMPONENTS.hidden` is null in both renderers, so there is nothing to
    // place. Excluded by TYPE rather than by name, so the next hidden field needs no
    // edit here and a non-hidden field can never be waved through.
    const hidden = new Set(
      (STARTER_SCHEMA.model.fields as readonly FieldDef[])
        .filter((field) => field.type === 'hidden')
        .map((field) => field.key),
    )
    const gaps = (STARTER_SCHEMA.layouts ?? []).flatMap((layout) => {
      const missing = unreferencedPaths(STARTER_SCHEMA, layout.name) ?? []
      return missing
        .filter((path) => !hidden.has(path))
        .map((path) => `${layout.name} does not place ${path}`)
    })

    expect(gaps).toEqual([])

    // A guard on the guard: no layouts at all would make the above vacuous, and this
    // form HAVING a layout is the whole reason the bug was possible.
    expect((STARTER_SCHEMA.layouts ?? []).length).toBeGreaterThan(0)
  })

  test('contains every field type it claims to', () => {
    const seen = typesUsed(STARTER_SCHEMA.model.fields as readonly FieldDef[])

    // `group` and `page` are the two that nest a form inside a form: a page
    // turns this into a wizard and a group changes the shape of the data.
    // The intro says "except the two that nest", so those two are the
    // exclusions and there are no others.
    const nesting: readonly FieldType[] = ['group', 'page']
    const expected = FIELD_TYPES.filter((type) => !nesting.includes(type))

    expect([...seen].sort()).toEqual([...expected].sort())
  })

  test('declares the version its newest construct needs, whatever that is', () => {
    // Not cosmetic. A document may not contain a construct from a later version
    // than the one it declares, and `validateSchema` refuses one by name — which
    // is what once made three field types unreachable in the builder.
    //
    // Against the constant rather than a literal. This said `'2'` and had to be
    // corrected when `signature` arrived, which is a test that has to be edited
    // every time the thing it guards is extended — the shape that teaches people
    // to edit it without reading it.
    expect(STARTER_SCHEMA.specVersion).toBe(CURRENT_SPEC_VERSION)
  })

  test('uses the layout kinds version 2 added, not only the version 1 ones', () => {
    const kinds = new Set<string>()
    const walk = (nodes: readonly { kind: string; children?: readonly unknown[] }[]): void => {
      for (const node of nodes) {
        kinds.add(node.kind)
        if (node.children !== undefined) {
          walk(node.children as readonly { kind: string; children?: readonly unknown[] }[])
        }
      }
    }
    walk(STARTER_SCHEMA.layouts[0]!.nodes as readonly { kind: string }[])

    expect(kinds).toContain('tabs')
    expect(kinds).toContain('table')
  })

  test('every container type the spec has is either used or deliberately absent', () => {
    // A guard on the guard: if the spec grows a container type, the exclusion
    // list above stops being a complete account of what is missing and this
    // says so rather than letting the claim quietly rot.
    expect(CONTAINER_FIELD_TYPES).toEqual(['group', 'page', 'repeater'])
  })

  test('a rule the condition editor wrote says what its metadata compiles to', () => {
    // The CEL is what runs and the `editor` metadata is what the logic panel reopens
    // from and recompiles. A starter rule whose CEL was edited by hand and whose
    // metadata was not would show one condition in the Rules tab and evaluate another.
    const written = (STARTER_SCHEMA.logic?.rules ?? []).filter((rule) => rule.editor !== undefined)

    expect(written.length).toBeGreaterThan(0)
    for (const rule of written) {
      expect(rule.cel, rule.target).toBe(compileGroup(rule.editor as ConditionGroup))
    }
  })

  test('demonstrates a rule on a field in a repeater row, written by the editor', () => {
    // The builder writes one since 0129; a demo with none would leave the claim in prose.
    const inRow = (STARTER_SCHEMA.logic?.rules ?? []).filter(
      (rule) => rule.target.includes('[]') && rule.editor !== undefined,
    )

    expect(inRow.length).toBeGreaterThan(0)
  })
})
