import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
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
