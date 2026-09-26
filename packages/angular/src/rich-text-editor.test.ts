import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy, provideFormancyRichTextEditor } from './index'
import type { RichTextEditorFactory, RichTextEditorHandle, RichTextEditorMount } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The `richtext` field with and without a host editor, under Angular.
 *
 * Deliberately the same assertions the React suite makes, against the same
 * interface. Two renderers agreeing is the project's central claim, and this is
 * the one place the conformance suite structurally cannot check it — what the
 * HOST passes in is not visible to a driver that only queries the DOM. So it is
 * asserted twice, once per binding, on purpose
 * ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 */
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

const fresh = (): Spy => ({ mounts: [], setValues: [], destroys: { count: 0 }, current: '' })

/**
 * What a real editor does when somebody types.
 *
 * Its own document changes FIRST, then it tells the host. A spy that reported a
 * change without holding it made the "not reset by its own change" guard vacuous
 * — which this binding caught first, because signals re-ran the effect where
 * React's test had simply never re-rendered.
 */
function typeInto(spy: Spy, mount: RichTextEditorMount, text: string): void {
  spy.current = text
  mount.onChange(text)
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

const engineFor = (schema: FormSchema): FormEngine =>
  createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-26', random: () => 0.5 },
  })

async function renderForm(engine: FormEngine, factory?: RichTextEditorFactory) {
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...(factory === undefined ? [] : [provideFormancyRichTextEditor(factory)]),
    ],
  })
  await view.fixture.whenStable()
  return view
}

describe('without a host editor', () => {
  test('the field is a textarea with a toolbar, not a broken field', async () => {
    await renderForm(engineFor(SCHEMA))

    // Its absence is the default and a supported state, not a misconfiguration.
    expect(screen.getByRole('textbox', { name: /Notes/ })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: /Notes/ })).toBeTruthy()
  })
})

describe('with a host editor', () => {
  test('it is mounted, and our toolbar and preview step aside', async () => {
    const spy = fresh()
    await renderForm(engineFor(SCHEMA), spyFactory(spy))

    expect(spy.mounts.length).toBe(1)
    // Two toolbars over one value is how they come to disagree, and the surface
    // is its own preview — the whole reason somebody asked for it.
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(document.querySelector('[data-formancy-part="richtext-preview"]')).toBeNull()
    expect(document.querySelector('[data-formancy-part="richtext-editor"]')).toBeTruthy()
  })

  test('the engine’s ids reach the editing surface', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    await renderForm(engine, spyFactory(spy))
    const snapshot = engine.getFieldSnapshot(['notes'])

    // The same object the React binding passes, because both read it from the
    // engine rather than assembling their own.
    expect(spy.mounts[0]!.attributes['id']).toBe(snapshot.props.control.id)
    expect(spy.mounts[0]!.attributes['aria-labelledby']).toBe(snapshot.props.label.id)
  })

  test('a required field says so on the surface', async () => {
    const spy = fresh()
    await renderForm(engineFor(SCHEMA), spyFactory(spy))

    expect(spy.mounts[0]!.attributes['aria-required']).toBe('true')
  })

  test('opens with the stored answer, in the grammar', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    engine.setValue(['notes'], '**already** written')
    await renderForm(engine, spyFactory(spy))

    expect(spy.mounts[0]!.value).toBe('**already** written')
    expect(spy.mounts[0]!.value).not.toContain('<')
  })

  test('what the editor reports becomes the field value', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    await renderForm(engine, spyFactory(spy))

    typeInto(spy, spy.mounts[0]!, '*edited*')

    expect(engine.getFieldSnapshot(['notes']).value).toBe('*edited*')
  })

  test('a value changed elsewhere is pushed in', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    const view = await renderForm(engine, spyFactory(spy))

    // A calculation, a resumed draft, a reset — not a keystroke.
    engine.setValue(['notes'], 'from somewhere else')
    await view.fixture.whenStable()

    expect(spy.setValues).toEqual(['from somewhere else'])
  })

  test('but the editor is not reset by the change it just reported', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    const view = await renderForm(engine, spyFactory(spy))

    typeInto(spy, spy.mounts[0]!, 'typed')
    await view.fixture.whenStable()

    // Pushing it back would move the caret to the end after every keystroke,
    // which is the difference between an editor and a box that fights you.
    expect(spy.setValues).toEqual([])
  })

  test('is mounted once, not rebuilt when the value changes', async () => {
    const spy = fresh()
    const engine = engineFor(SCHEMA)
    const view = await renderForm(engine, spyFactory(spy))

    engine.setValue(['notes'], 'one')
    await view.fixture.whenStable()
    engine.setValue(['notes'], 'two')
    await view.fixture.whenStable()

    // A contenteditable rebuilt on every change loses the caret, the selection
    // and the undo stack.
    expect(spy.mounts.length).toBe(1)
    expect(spy.destroys.count).toBe(0)
  })

  test('is destroyed when the form goes away', async () => {
    const spy = fresh()
    await renderForm(engineFor(SCHEMA), spyFactory(spy))

    TestBed.resetTestingModule()

    // ProseMirror holds DOM listeners and a plugin state. One left per mounted
    // form is a leak that only shows up in a long-lived admin app.
    expect(spy.destroys.count).toBe(1)
  })

  test('a disabled field is not editable', async () => {
    const spy = fresh()
    const schema: FormSchema = {
      ...SCHEMA,
      logic: { rules: [{ target: 'notes', kind: 'disabled', cel: 'true' }] },
    }
    await renderForm(engineFor(schema), spyFactory(spy))

    // An editable surface on a disabled field accepts typing that is then
    // thrown away, which is worse than not offering it.
    expect(spy.mounts[0]!.editable).toBe(false)
  })
})
