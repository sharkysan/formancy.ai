import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, RichTextEditorProvider } from './index.js'
import type { RichTextEditorFactory, RichTextEditorHandle, RichTextEditorMount } from './index.js'

afterEach(cleanup)

/**
 * The `richtext` field with and without a host-supplied editor.
 *
 * Two things are pinned. **Without a factory the field still works** — a
 * deployment that does not want ProseMirror gets the textarea and a toolbar, not
 * a broken field, which is why the absence of an editor is a supported state
 * rather than a misconfiguration. And **with one, the engine keeps owning the
 * accessibility wiring**: the ids and the `aria-describedby` composition are
 * computed centrally so React and Angular are byte-identical, and an editor
 * package that labelled its own surface would be a third implementation of that
 * and the one nobody tests
 * ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 *
 * A fake factory rather than the real TipTap: what is under test is the
 * renderer's half of the contract — what it passes in, when it pushes a value,
 * and that it mounts once. `@formancy/tiptap` tests the editor against a real
 * ProseMirror separately, which is the division that keeps both honest.
 */
const CAPABILITIES = { now: () => 0, today: () => '2026-09-26', random: () => 0.5 }

const SCHEMA: FormSchema = {
  specVersion: '2',
  id: 'notes',
  title: 'Notes',
  model: {
    fields: [{ key: 'notes', type: 'richtext', label: 'Notes', required: true }],
  },
}

interface Spy {
  readonly mounts: RichTextEditorMount[]
  readonly setValues: string[]
  readonly destroys: { count: number }
  current: string
}

function spyFactory(spy: Spy): RichTextEditorFactory {
  return (mount): RichTextEditorHandle => {
    spy.mounts.push(mount)
    spy.current = mount.value
    return {
      value: () => spy.current,
      setValue: (value) => {
        spy.current = value
        spy.setValues.push(value)
      },
      destroy: () => {
        spy.destroys.count += 1
      },
    }
  }
}

const fresh = (): Spy => ({ mounts: [], setValues: [], destroys: { count: 0 }, current: '' })

/**
 * What a real editor does when somebody types.
 *
 * Its own document changes FIRST, then it tells the host. A spy that reported a
 * change without holding it made the "not reset by its own change" guard vacuous
 * — the Angular binding caught that, because signals re-ran the effect where
 * React's test had simply never re-rendered.
 */
function typeInto(spy: Spy, mount: RichTextEditorMount, text: string): void {
  spy.current = text
  mount.onChange(text)
}


function mountForm(factory?: RichTextEditorFactory) {
  const engine = createFormEngine({ schema: SCHEMA, capabilities: CAPABILITIES })
  const form = (
    <FormancyProvider engine={engine}>
      <FormancyForm />
    </FormancyProvider>
  )
  render(
    factory === undefined ? form : <RichTextEditorProvider value={factory}>{form}</RichTextEditorProvider>,
  )
  return engine
}

describe('without a host editor', () => {
  test('the field is a textarea with a toolbar, not a broken field', () => {
    mountForm()

    // The absence of an editor is a supported state. A form with no rich-text
    // field needs no ProseMirror, and one that has a rich-text field and no
    // editor still collects the answer.
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: /Notes/ })).toBeTruthy()
  })
})

describe('with a host editor', () => {
  test('it is mounted, and our toolbar and preview step aside', () => {
    const spy = fresh()
    mountForm(spyFactory(spy))

    expect(spy.mounts.length).toBe(1)
    // Two toolbars over one value is how they come to disagree, and the
    // editing surface is its own preview — which is the whole reason somebody
    // asked for it.
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(document.querySelector('[data-formancy-part="richtext-preview"]')).toBeNull()
    expect(document.querySelector('[data-formancy-part="richtext-editor"]')).toBeTruthy()
  })

  test('the engine’s ids and describedby reach the editing surface', () => {
    const spy = fresh()
    const engine = mountForm(spyFactory(spy))
    const snapshot = engine.getFieldSnapshot(['notes'])
    const mount = spy.mounts[0]!

    // Passed in rather than invented: this is the same object the textarea
    // would have spread, so the two paths cannot drift in what they announce.
    expect(mount.attributes['id']).toBe(snapshot.props.control.id)
    expect(mount.attributes['aria-labelledby']).toBe(snapshot.props.label.id)
    // `aria-labelledby` and not a `<label for>`: the surface is a div, and
    // `for` does not reach one.
    expect(mount.attributes['aria-labelledby']).toBeTruthy()
  })

  test('a required field says so on the surface', () => {
    const spy = fresh()
    mountForm(spyFactory(spy))

    expect(spy.mounts[0]!.attributes['aria-required']).toBe('true')
  })

  test('opens with the stored answer, in the grammar', () => {
    const spy = fresh()
    const engine = createFormEngine({ schema: SCHEMA, capabilities: CAPABILITIES })
    engine.setValue(['notes'], '**already** written')
    render(
      <RichTextEditorProvider value={spyFactory(spy)}>
        <FormancyProvider engine={engine}>
          <FormancyForm />
        </FormancyProvider>
      </RichTextEditorProvider>,
    )

    // The grammar, not HTML. What crosses this boundary is the whole reason an
    // editor is admissible at all.
    expect(spy.mounts[0]!.value).toBe('**already** written')
    expect(spy.mounts[0]!.value).not.toContain('<')
  })

  test('what the editor reports becomes the field value', () => {
    const spy = fresh()
    const engine = mountForm(spyFactory(spy))

    act(() => {
      typeInto(spy, spy.mounts[0]!, '*edited*')
    })

    expect(engine.getFieldSnapshot(['notes']).value).toBe('*edited*')
  })

  test('a value changed elsewhere is pushed in', () => {
    const spy = fresh()
    const engine = mountForm(spyFactory(spy))

    // A calculation, a resumed draft, a reset — not a keystroke. Wrapped in
    // `act` because the push happens in an effect, and an effect that has not
    // been flushed is indistinguishable from one that never ran.
    act(() => {
      engine.setValue(['notes'], 'from somewhere else')
    })

    expect(spy.setValues).toEqual(['from somewhere else'])
  })

  test('but the editor is not reset by the change it just reported', () => {
    const spy = fresh()
    mountForm(spyFactory(spy))

    // Inside `act`, so the re-render and the effect actually happen. Without
    // it this test passed for the wrong reason: nothing re-rendered, so nothing
    // could have pushed a value back either way.
    act(() => {
      typeInto(spy, spy.mounts[0]!, 'typed')
    })

    // Pushing this back in would move the caret to the end after every
    // keystroke, which is the difference between an editor and a box that
    // fights you. Comparing before setting is what prevents it.
    expect(spy.setValues).toEqual([])
  })

  test('is mounted once, not rebuilt when the value changes', () => {
    const spy = fresh()
    const engine = mountForm(spyFactory(spy))

    engine.setValue(['notes'], 'one')
    engine.setValue(['notes'], 'two')

    // A contenteditable rebuilt on every change loses the caret, the selection
    // and the undo stack.
    expect(spy.mounts.length).toBe(1)
    expect(spy.destroys.count).toBe(0)
  })

  test('is destroyed when the form goes away', () => {
    const spy = fresh()
    mountForm(spyFactory(spy))

    cleanup()

    // ProseMirror holds DOM listeners and a plugin state. Leaving one per
    // mounted form is a leak that only shows up in a long-lived admin app.
    expect(spy.destroys.count).toBe(1)
  })

  test('a disabled field is not editable', () => {
    const spy = fresh()
    const schema: FormSchema = {
      ...SCHEMA,
      logic: { rules: [{ target: 'notes', kind: 'disabled', cel: 'true' }] },
    }
    const engine = createFormEngine({ schema, capabilities: CAPABILITIES })
    render(
      <RichTextEditorProvider value={spyFactory(spy)}>
        <FormancyProvider engine={engine}>
          <FormancyForm />
        </FormancyProvider>
      </RichTextEditorProvider>,
    )

    // An editable surface on a disabled field accepts typing that is then
    // thrown away, which is worse than not offering it.
    expect(spy.mounts[0]!.editable).toBe(false)
  })
})

describe('the factory is the host’s, and only used when given', () => {
  test('nothing is constructed when no factory is provided', () => {
    const made = vi.fn()
    mountForm()

    expect(made).not.toHaveBeenCalled()
  })
})
