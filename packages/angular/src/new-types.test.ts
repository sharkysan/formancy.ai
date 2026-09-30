import { provideZonelessChangeDetection } from '@angular/core'
import { computeAccessibleName } from 'dom-accessibility-api'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy, provideFormancyUploader } from './index'
import type { StoredFile } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * The spec 2 field types and layout kinds under Angular.
 *
 * Deliberately the same assertions the React suite makes, by role and
 * accessible name only. Two renderers agreeing is the project's central claim,
 * and a claim checked in one place is a claim about one renderer.
 */
const base = (over: Partial<FormSchema>): FormSchema => ({
  specVersion: '2',
  id: 'wide',
  title: 'Wide',
  model: { fields: [] },
  ...over,
})

async function renderForm(engine: FormEngine, providers: unknown[] = []) {
  const view = await render(FormancyForm, {
    componentInputs: { layout: 'web' },
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...(providers as never[]),
    ],
  })
  await view.fixture.whenStable()
  return view
}

const engineFor = (schema: FormSchema): FormEngine =>
  createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-22', random: () => 0.5 },
  })

/*
 * Compile the form once, before any test is timed.
 *
 * The first `render(FormancyForm, …)` in a file compiles the component and
 * everything the registry pulls in, and the test that happened to be first paid
 * for it: 372ms against 39ms for the one after it. Charging a one-off cost to
 * whichever case is written first is how a suite acquires a test that looks slow
 * and is not, and it is the case CI timed out on.
 *
 * Measured: 372ms to 196ms for that test. The rest is the render itself, which
 * is work these cases are actually about.
 */
beforeAll(async () => {
  await renderForm(engineFor(base({})))
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

describe('selectboxes', () => {
  const schema = base({
    model: {
      fields: [
        {
          key: 'topics',
          type: 'selectboxes',
          label: 'Topics',
          required: true,
          options: [
            { value: 'news', label: 'News' },
            { value: 'offers', label: 'Offers' },
            { value: 'events', label: 'Events' },
          ],
        },
      ],
    },
  })

  test('is a group of checkboxes with one accessible name for the question', async () => {
    const engine = engineFor(schema)
    await renderForm(engine)

    const group = screen.getByRole('group', { name: 'Topics' })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(3)
  })

  test('ticking builds the list in the options own order', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Events' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'News' }))
    await view.fixture.whenStable()

    // Byte-identical to what the React binding stores for the same clicks.
    expect(engine.value()).toEqual({ topics: ['news', 'events'] })
  })

  test('required is announced on the question, not on every box', async () => {
    await renderForm(engineFor(schema))

    // In the description, not as aria-required: role=group does not support
    // that attribute, so assistive technology ignores it and an auditor calls
    // it invalid ARIA. The conformance run's axe pass is what found this.
    const group = screen.getByRole('group', { name: 'Topics' })
    const described = (group.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())

    expect(described).toContain('required')
    expect(group.getAttribute('aria-required')).toBeNull()
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box.getAttribute('aria-required')).toBeNull()
    }
  })
})

describe('richtext', () => {
  const schema = base({
    model: { fields: [{ key: 'notes', type: 'richtext', label: 'Notes' }] },
  })

  test('is a textarea', async () => {
    await renderForm(engineFor(schema))

    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA')
  })

  test('has the same toolbar the React renderer has', async () => {
    await renderForm(engineFor(schema))

    // The same five, named the same way. The transformations live in
    // @formancy/spec so a Bold button cannot mean one thing here and
    // something else there — this asserts the row agrees as well.
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting for Notes' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'BBold',
      'IItalic',
      '↗Link',
      '•Bulleted list',
      '1.Numbered list',
    ])
    expect(buttons.filter((button) => button.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  test('Bold wraps the selection in the grammar', async () => {
    await renderForm(engineFor(schema))

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    fireEvent.input(box, { target: { value: 'hello there' } })
    box.setSelectionRange(0, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))

    expect(box.value).toBe('**hello** there')
  })

  test('pressing Bold again takes it off', async () => {
    await renderForm(engineFor(schema))

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    fireEvent.input(box, { target: { value: '**hello**' } })
    box.setSelectionRange(2, 7)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))

    expect(box.value).toBe('hello')
  })

  test('Ctrl+B does the same thing as the button', async () => {
    await renderForm(engineFor(schema))

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    fireEvent.input(box, { target: { value: 'hello' } })
    box.setSelectionRange(0, 5)
    fireEvent.keyDown(box, { key: 'b', ctrlKey: true })

    expect(box.value).toBe('**hello**')
  })

  test('the arrow keys move along the toolbar', async () => {
    await renderForm(engineFor(schema))

    const bold = screen.getByRole('button', { name: 'Bold' })
    bold.focus()
    fireEvent.keyDown(bold.parentElement as HTMLElement, { key: 'ArrowRight' })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Italic' }))
  })

  test('a list button marks every line the selection touches', async () => {
    await renderForm(engineFor(schema))

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    fireEvent.input(box, { target: { value: 'one\ntwo' } })
    box.setSelectionRange(0, 7)
    fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }))

    expect(box.value).toBe('- one\n- two')
  })

  test('a script tag somebody types stays text', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)

    const typed = '<img src=x onerror=alert(1)>'
    const area = screen.getByRole('textbox', { name: 'Notes' })
    fireEvent.input(area, { target: { value: typed } })
    await view.fixture.whenStable()

    // No [innerHTML] anywhere on this path, so there is no element to find.
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('[data-formancy-part="richtext"]')?.textContent?.trim()).toBe(
      typed,
    )
  })

  test('a javascript: link renders as text, an https one as a link', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    const area = screen.getByRole('textbox', { name: 'Notes' })

    fireEvent.input(area, { target: { value: '[click](javascript:alert(1))' } })
    await view.fixture.whenStable()
    expect(screen.queryByRole('link')).toBeNull()

    fireEvent.input(area, { target: { value: '[docs](https://example.ch)' } })
    await view.fixture.whenStable()
    expect(screen.getByRole('link', { name: 'docs' }).getAttribute('href')).toBe(
      'https://example.ch',
    )
  })
})

describe('file', () => {
  const schema = base({
    model: {
      fields: [
        { key: 'evidence', type: 'file', label: 'Evidence', accept: ['application/pdf'] },
      ],
    },
  })

  const stored: StoredFile = {
    id: 'f1',
    name: 'report.pdf',
    size: 10,
    contentType: 'application/pdf',
    storageKey: 'k1',
  }

  test('without an uploader it says so rather than pretending', async () => {
    await renderForm(engineFor(schema))

    expect(screen.queryByLabelText('Evidence')).toBeNull()
    expect(screen.getByText(/no upload destination/)).toBeTruthy()
  })

  test('with one, the picker offers what the field accepts', async () => {
    await renderForm(engineFor(schema), [provideFormancyUploader(async () => stored)])

    expect(screen.getByLabelText('Evidence').getAttribute('accept')).toBe('application/pdf')
  })

  test('a file that uploaded is kept even when a later one fails', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine, [
      provideFormancyUploader(async (file) => {
        if (file.name === 'second.pdf') throw new Error('the object store is full')
        return { ...stored, id: `id-${file.name}`, name: file.name }
      }),
    ])

    const input = screen.getByLabelText<HTMLInputElement>('Evidence')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['x'], 'first.pdf', { type: 'application/pdf' }),
          new File(['x'], 'second.pdf', { type: 'application/pdf' }),
        ],
      },
    })
    await view.fixture.whenStable()

    // The same assertion the React suite makes, because the bug was the same in
    // both: discarding the file that DID upload leaves bytes in storage the
    // submission never mentions, collected as unclaimed within the day, while
    // telling somebody the upload failed when half of it did not.
    await waitFor(() =>
      expect(engine.value()).toEqual({
        evidence: [{ ...stored, id: 'id-first.pdf', name: 'first.pdf' }],
      }),
    )
    expect(screen.getByRole('status').textContent).toContain('second.pdf')
  })

  test('a file dropped on the field is uploaded, the same as one picked', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine, [
      provideFormancyUploader(async (file) => ({ ...stored, id: `id-${file.name}`, name: file.name })),
    ])

    const zone = document.querySelector('[data-formancy-part="file-dropzone"]')!
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'dropped.pdf', { type: 'application/pdf' })] },
    })
    await view.fixture.whenStable()

    // A second route to the same upload, not a second implementation of it.
    await waitFor(() =>
      expect(engine.value()).toEqual({
        evidence: [{ ...stored, id: 'id-dropped.pdf', name: 'dropped.pdf' }],
      }),
    )
  })

  test('the drop zone is an addition, not a replacement for the picker', async () => {
    await renderForm(engineFor(schema), [provideFormancyUploader(async () => stored)])

    // A drop target is a pointer gesture with no keyboard equivalent, so the
    // input has to stay: dropping cannot be the only way to attach a file.
    expect(screen.getByLabelText('Evidence')).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="file-dropzone"]')).toBeTruthy()
  })

  test('dragging over says so, and says it again when the file leaves', async () => {
    const view = await renderForm(engineFor(schema), [
      provideFormancyUploader(async () => stored),
    ])
    const zone = document.querySelector('[data-formancy-part="file-dropzone"]')!

    fireEvent.dragOver(zone)
    await view.fixture.whenStable()
    expect(zone.getAttribute('data-state')).toBe('over')

    fireEvent.dragLeave(zone)
    await view.fixture.whenStable()
    // Cleared on leave, or the field claims a file is hovering over it forever.
    expect(zone.getAttribute('data-state')).toBe(null)
  })

  test('removing an attachment can be undone, and it goes back in place', async () => {
    const engine = engineFor(schema)
    const first = { ...stored, id: 'id-first', name: 'first.pdf' }
    const second = { ...stored, id: 'id-second', name: 'second.pdf' }
    engine.setValue(['evidence'], [first, second])
    const view = await renderForm(engine, [provideFormancyUploader(async () => stored)])
    await view.fixture.whenStable()

    fireEvent.click(screen.getByRole('button', { name: 'Remove first.pdf' }))
    await view.fixture.whenStable()
    expect(engine.value()).toEqual({ evidence: [second] })

    fireEvent.click(screen.getByRole('button', { name: 'Undo removing first.pdf' }))
    await view.fixture.whenStable()

    // Back where it was, not on the end: the order matters to somebody who
    // numbered their attachments in a covering note.
    expect(engine.value()).toEqual({ evidence: [first, second] })
  })

  test('an attachment gets a remove control named after it', async () => {
    const engine = engineFor(schema)
    engine.setValue(['evidence'], [stored])
    const view = await renderForm(engine, [provideFormancyUploader(async () => stored)])
    await view.fixture.whenStable()

    const remove = screen.getByRole('button', { name: 'Remove report.pdf' })
    fireEvent.click(remove)
    await view.fixture.whenStable()

    expect(engine.value()).toEqual({ evidence: [] })
  })
})

describe('time', () => {
  // Near-copies of the React cases on purpose: two renderers agreeing is the claim
  // this repository rests on, and the way it stops being true is a shared helper
  // reporting that both implemented something when one had not.
  const schema = base({
    model: {
      fields: [{ key: 'slot', type: 'time', label: 'Slot', earliest: '09:00', latest: '17:00' }],
    },
  } as Partial<FormSchema>)

  test('is a control a person can find and fill in', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    const input = screen.getByLabelText('Slot')
    fireEvent.input(input, { target: { value: '10:30' } })
    await view.fixture.whenStable()
    expect(engine.value()).toEqual({ slot: '10:30' })
  })

  test('hands its bounds to the browser as well as to the engine', async () => {
    await renderForm(engineFor(schema))
    const input = screen.getByLabelText('Slot')
    expect(input.getAttribute('min')).toBe('09:00')
    expect(input.getAttribute('max')).toBe('17:00')
  })

  test('stores null rather than an empty string when cleared', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    const input = screen.getByLabelText('Slot')
    fireEvent.input(input, { target: { value: '10:30' } })
    fireEvent.input(input, { target: { value: '' } })
    await view.fixture.whenStable()
    expect(engine.value()).toEqual({ slot: null })
  })
})

describe('datetime', () => {
  const schema = base({
    model: { fields: [{ key: 'at', type: 'datetime', label: 'Starts' }] },
  } as Partial<FormSchema>)

  test('converts the local wall clock the control shows into a stored instant', async () => {
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    fireEvent.input(screen.getByLabelText('Starts'), { target: { value: '2026-09-19T10:30' } })
    await view.fixture.whenStable()
    const stored = (engine.value() as { at?: string }).at
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    // Compared as instants, because the test's own zone is not the assertion.
    expect(new Date(stored ?? '').getTime()).toBe(new Date('2026-09-19T10:30').getTime())
  })

  test('shows a stored instant back as the reader’s own local time', async () => {
    const local = new Date('2026-09-19T10:30')
    const engine = engineFor(schema)
    engine.setValue(['at'], `${local.toISOString().slice(0, 19)}Z`)
    const view = await renderForm(engine)
    await view.fixture.whenStable()
    const pad = (part: number): string => String(part).padStart(2, '0')
    const expected =
      `${String(local.getFullYear())}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}` +
      `T${pad(local.getHours())}:${pad(local.getMinutes())}`
    expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe(expected)
  })

  test('never stores a malformed string, whatever the control hands back', async () => {
    // The same property React asserts, and deliberately not the same exact object:
    // jsdom rejects an invalid `datetime-local` value differently under `input` than
    // under `change`, so one path calls setValue(null) and the other never fires.
    // What must hold in both, and does, is that the stored answer is empty or
    // canonical -- never a string the engine's shape check would have to reject.
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    fireEvent.input(screen.getByLabelText('Starts'), { target: { value: 'not a date' } })
    await view.fixture.whenStable()
    const stored = (engine.value() as { at?: unknown }).at
    expect(stored === undefined || stored === null).toBe(true)
  })
})

describe('qrcode', () => {
  // The same assertions React makes, deliberately not sharing a helper.
  const schema = base({
    model: { fields: [{ key: 'reference', type: 'text', label: 'Booking reference' }] },
    layouts: [
      {
        name: 'web',
        nodes: [
          { kind: 'field', path: 'reference' },
          { kind: 'qrcode', path: 'reference', label: 'Your pass' },
        ],
      },
    ],
  } as Partial<FormSchema>)

  test('says what the code IS, with a name attached rather than a label beside it', async () => {
    // The bug this exists for, reported against the running playground: the label was a
    // span next to the value and named nothing. Measured before the fix with a real
    // accessible-name implementation, the value's name was the empty string.
    //
    // `<output>` is a live region, so a screen reader announces the text when the answer
    // changes — an unnamed one reads a booking reference out of nowhere.
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()

    const value = document.querySelector('[data-formancy-part="code-value"]')!
    expect(computeAccessibleName(value)).toBe('Your pass')
    expect(document.querySelector('[data-formancy-part="code-label"]')?.textContent?.trim()).toBe(
      'Your pass',
    )
  })

  test('shows the value of the answer it encodes, as text', async () => {
    // The accessible content is the VALUE, not the picture: a picture of a code says
    // nothing to a screen reader, and neither does an alt of "QR code".
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    expect(screen.getByText('AB-1234')).toBeDefined()
  })

  test('collects nothing, so it adds no control and no answer', async () => {
    const engine = engineFor(schema)
    await renderForm(engine)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    engine.setValue(['reference'], 'AB-1234')
    expect(engine.value()).toEqual({ reference: 'AB-1234' })
  })

  test('says whether there is anything to encode yet', async () => {
    // Live, which is what the component exists for: reading the snapshot from the layout
    // rendered the value once and never again, because a method call is not a signal an
    // OnPush component re-runs for.
    const engine = engineFor(schema)
    const view = await renderForm(engine)
    expect(document.querySelector('[data-formancy-part="code"]')?.getAttribute('data-state')).toBe(
      'empty',
    )
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    expect(document.querySelector('[data-formancy-part="code"]')?.getAttribute('data-state')).toBe(
      'ready',
    )
  })
})

describe('tabs', () => {
  const schema = base({
    model: {
      fields: [
        { key: 'first', type: 'text', label: 'First name' },
        { key: 'email', type: 'text', label: 'Email', required: true },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          {
            kind: 'tabs',
            label: 'Application',
            children: [
              { kind: 'section', label: 'About you', children: [{ kind: 'field', path: 'first' }] },
              { kind: 'section', label: 'Contact', children: [{ kind: 'field', path: 'email' }] },
            ],
          },
        ],
      },
    ],
  })

  test('is the ARIA tabs pattern, named by the strip', async () => {
    await renderForm(engineFor(schema))

    const strip = screen.getByRole('tablist', { name: 'Application' })
    expect(within(strip).getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
      'About you',
      'Contact',
    ])
  })

  test('the strip is one tab stop', async () => {
    await renderForm(engineFor(schema))

    expect(screen.getByRole('tab', { name: 'About you' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('tabindex')).toBe('-1')
  })

  test('arrows move between tabs, and End reaches the last', async () => {
    const view = await renderForm(engineFor(schema))
    const strip = screen.getByRole('tablist', { name: 'Application' })

    fireEvent.keyDown(strip, { key: 'ArrowRight' })
    await view.fixture.whenStable()
    expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(strip, { key: 'Home' })
    await view.fixture.whenStable()
    expect(screen.getByRole('tab', { name: 'About you' }).getAttribute('aria-selected')).toBe('true')
  })

  test('a closed panel is hidden, not removed, so its field is still validated', async () => {
    const engine = engineFor(schema)
    await renderForm(engine)

    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels).toHaveLength(2)
    expect([...panels].filter((panel) => panel.hasAttribute('hidden'))).toHaveLength(1)

    // Tabs are presentation, unlike pages.
    expect(engine.submit().errors['email']).toContain('required')
  })

  test('failed submit reveals the panel before focusing its control', async () => {
    const view = await renderForm(engineFor(schema))

    const email = screen.getByRole('textbox', { name: 'Email', hidden: true })
    const focus = email.focus.bind(email)
    email.focus = () => {
      expect(email.closest('[hidden]')).toBeNull()
      focus()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(document.activeElement).toBe(email)
    await view.fixture.whenStable()

    expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('table', () => {
  const schema = base({
    model: {
      fields: [
        { key: 'a', type: 'text', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
      ],
    },
    layouts: [
      {
        name: 'web',
        nodes: [
          {
            kind: 'table',
            columns: 2,
            label: 'Measurements',
            children: [
              { kind: 'field', path: 'a' },
              { kind: 'field', path: 'b' },
            ],
          },
        ],
      },
    ],
  })

  test('is a labelled group and not a <table>', async () => {
    await renderForm(engineFor(schema))

    // Laying fields out in a grid is not tabular data, and marking it up as a
    // table would announce rows and columns that mean nothing (WCAG 1.3.1).
    expect(screen.getByRole('group', { name: 'Measurements' })).toBeTruthy()
    expect(document.querySelector('table')).toBeNull()
  })

  test('declares its column count for the stylesheet', async () => {
    await renderForm(engineFor(schema))

    expect(
      screen.getByRole('group', { name: 'Measurements' }).getAttribute('data-columns'),
    ).toBe('2')
  })
})

describe('the signature field, which must behave as the React one does', () => {
  /*
   * Same assertions as `packages/react/src/signature.test.tsx`, by role and
   * accessible name. Two renderers agreeing is this project's central claim, and
   * a claim checked in one place is a claim about one renderer.
   *
   * The conformance fixtures cannot carry this one: their vocabulary is filling
   * in and clicking by accessible name, and there is no way to say "draw" in it.
   * So the parity is held here, deliberately and by hand.
   */
  const signing = (): FormSchema =>
    base({
      specVersion: '3',
      model: {
        fields: [{ key: 'mark', type: 'signature', label: 'Sign here', box: [600, 200] }],
      },
    })

  test('records a stroke as whole-numbered points', async () => {
    const engine = engineFor(signing())
    await renderForm(engine)

    const surface = screen.getByRole('img', { name: /sign here/i })
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10 })
    // Several moves, because one move is the single shape that hid a real bug:
    // each move appended a new stroke instead of extending the one in progress.
    for (let step = 0; step < 12; step += 1) {
      fireEvent.pointerMove(surface, { clientX: 10 + step * 4, clientY: 15 + step })
    }
    fireEvent.pointerUp(surface)

    const drawn = (engine.value() as { mark?: { drawn?: number[][][] } }).mark?.drawn
    expect(drawn).toHaveLength(1)
    expect(drawn?.[0]).toHaveLength(13)
    for (const [x, y] of drawn?.[0] ?? []) {
      expect(Number.isInteger(x)).toBe(true)
      expect(Number.isInteger(y)).toBe(true)
    }
  })

  test('keeps the mark when the pointer leaves after the pen has lifted', async () => {
    /*
     * The parity case for the bug the playground reported: `pointerleave` shares
     * the handler that ends a stroke, and once the pen has already lifted there is
     * nothing in progress — so it committed the strokes from before the LAST one
     * and the signature vanished. Both renderers had it, in the same shape, which
     * is what two independent implementations of one behaviour costs.
     */
    const engine = engineFor(signing())
    await renderForm(engine)

    const surface = screen.getByRole('img', { name: /sign here/i })
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10 })
    for (let step = 0; step < 12; step += 1) {
      fireEvent.pointerMove(surface, { clientX: 10 + step * 4, clientY: 15 + step })
    }
    fireEvent.pointerUp(surface)
    // The hand moves away, which is what a person does next.
    fireEvent.pointerLeave(surface)

    expect((engine.value() as { mark?: { drawn?: number[][][] } }).mark?.drawn).toHaveLength(1)
  })

  test('and a pen leaving mid-stroke still ends that stroke', async () => {
    // Why `pointerleave` is wired up at all, and it must keep working: a pointer
    // that goes past the edge with the button down never sends `pointerup` here,
    // so without this the next press would extend a stroke from a minute ago.
    const engine = engineFor(signing())
    await renderForm(engine)

    const surface = screen.getByRole('img', { name: /sign here/i })
    fireEvent.pointerDown(surface, { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 30 })
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 60 })
    fireEvent.pointerLeave(surface)

    fireEvent.pointerDown(surface, { clientX: 90, clientY: 10 })
    fireEvent.pointerMove(surface, { clientX: 120, clientY: 20 })
    fireEvent.pointerUp(surface)

    expect((engine.value() as { mark?: { drawn?: number[][][] } }).mark?.drawn).toHaveLength(2)
  })

  test('typing a name is the answer, and replaces a mark', async () => {
    const engine = engineFor(signing())
    await renderForm(engine)

    const box = screen.getByRole('textbox', { name: /type your name/i })
    fireEvent.input(box, { target: { value: 'Mara' } })

    expect((engine.value() as { mark?: unknown }).mark).toEqual({ typed: 'Mara' })
  })

  test('clearing empties the answer rather than leaving an empty mark', async () => {
    const engine = engineFor(signing())
    await renderForm(engine)

    const surface = screen.getByRole('img', { name: /sign here/i })
    fireEvent.pointerDown(surface, { clientX: 1, clientY: 1 })
    fireEvent.pointerMove(surface, { clientX: 4, clientY: 4 })
    fireEvent.pointerUp(surface)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect((engine.value() as { mark?: unknown }).mark ?? null).toBeNull()
  })

  test('emits the parts a theme dresses, with the names the React renderer uses', async () => {
    await renderForm(engineFor(signing()))

    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    for (const part of ['signature', 'signature-surface', 'signature-typed', 'signature-clear']) {
      expect(parts, `no ${part}`).toContain(part)
    }
  })
})

describe('the tag picker, which must behave as the React one does', () => {
  const tagging = (): FormSchema =>
    base({
      specVersion: '3',
      model: {
        fields: [
          {
            key: 'topics',
            type: 'selectboxes',
            label: 'Topics',
            widget: 'tagpicker',
            options: [
              { value: 'a11y', label: 'Accessibility' },
              { value: 'forms', label: 'Forms' },
              { value: 'i18n', label: 'Translation' },
            ],
          },
        ],
      },
    })

  test('narrows by typing and stores the option value', async () => {
    const engine = engineFor(tagging())
    await renderForm(engine)

    const box = screen.getByRole('combobox', { name: 'Topics' })
    fireEvent.input(box, { target: { value: 'trans' } })
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    })
    fireEvent.click(screen.getByRole('option', { name: 'Translation' }))

    await waitFor(() => {
      expect((engine.value() as { topics?: unknown }).topics).toEqual(['i18n'])
    })
  })

  test('keeps the options own order, however they were chosen', async () => {
    const engine = engineFor(tagging())
    await renderForm(engine)
    const box = screen.getByRole('combobox', { name: 'Topics' })

    fireEvent.input(box, { target: { value: 'trans' } })
    await waitFor(() => { expect(screen.getAllByRole('option')).toHaveLength(1) })
    fireEvent.click(screen.getByRole('option', { name: 'Translation' }))
    fireEvent.input(box, { target: { value: 'access' } })
    await waitFor(() => { expect(screen.getAllByRole('option')).toHaveLength(1) })
    fireEvent.click(screen.getByRole('option', { name: 'Accessibility' }))

    await waitFor(() => {
      expect((engine.value() as { topics?: unknown }).topics).toEqual(['a11y', 'i18n'])
    })
  })

  test('a chip names its answer and removes it, by a button named after it', async () => {
    const engine = engineFor(tagging())
    engine.setValue(['topics'], ['a11y', 'i18n'])
    await renderForm(engine)

    fireEvent.click(await screen.findByRole('button', { name: /remove accessibility/i }))

    await waitFor(() => {
      expect((engine.value() as { topics?: unknown }).topics).toEqual(['i18n'])
    })
  })

  test('emits the parts a theme dresses, with the names the React renderer uses', async () => {
    const engine = engineFor(tagging())
    engine.setValue(['topics'], ['a11y'])
    await renderForm(engine)

    const parts = [...document.querySelectorAll('[data-formancy-part]')].map((element) =>
      element.getAttribute('data-formancy-part'),
    )
    for (const part of ['tagpicker', 'tagpicker-chips', 'tagpicker-chip', 'tagpicker-remove']) {
      expect(parts, `no ${part}`).toContain(part)
    }
  })
})

describe('a skipped page under Angular, which must match the React one', () => {
  const routed = (): FormSchema =>
    base({
      specVersion: '3',
      model: {
        fields: [
          { key: 'p1', type: 'page', label: 'About you', fields: [{ key: 'needsVisa', type: 'checkbox', label: 'Do you need a visa?' }] },
          { key: 'p2', type: 'page', label: 'Visa details', fields: [{ key: 'passport', type: 'text', label: 'Passport number' }] },
          { key: 'p3', type: 'page', label: 'Confirm', fields: [{ key: 'agreed', type: 'checkbox', label: 'Agreed' }] },
        ],
      },
      logic: { rules: [{ target: 'p2', kind: 'skip', cel: 'needsVisa != true' }] },
    })

  test('names only the steps the form will actually take', async () => {
    const engine = engineFor(routed())
    const view = await renderForm(engine)

    const stepper = screen.getByRole('navigation', { name: /progress/i })
    expect(within(stepper).getAllByRole('listitem').map((item) => item.textContent?.trim())).toEqual([
      'About you',
      'Confirm',
    ])

    engine.setValue(['needsVisa'], true)
    await view.fixture.whenStable()
    await waitFor(() => {
      expect(within(stepper).getAllByRole('listitem')).toHaveLength(3)
    })
  })

  test('Next lands on the page it names', async () => {
    const engine = engineFor(routed())
    await renderForm(engine)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Agreed')).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })
})
