import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider, UploaderProvider } from './index.js'
import type { StoredFile, Uploader } from './index.js'

afterEach(cleanup)

/**
 * The spec 2 field types and layout kinds, by role and accessible name only.
 *
 * The rule the conformance drivers hold the renderers to applies here too: a
 * control a screen reader cannot find is a control no test can drive, so
 * nothing below reaches for a test id or a CSS selector.
 */
const CAPABILITIES = {
  now: () => 0,
  today: () => '2026-09-22',
  random: () => 0.5,
}

const mount = (schema: FormSchema, uploader?: Uploader) => {
  const engine = createFormEngine({ schema, capabilities: CAPABILITIES })
  const form = (
    <FormancyProvider engine={engine}>
      <FormancyForm {...(schema.layouts === undefined ? {} : { layout: schema.layouts[0]!.name })} />
    </FormancyProvider>
  )
  render(uploader === undefined ? form : <UploaderProvider value={uploader}>{form}</UploaderProvider>)
  return engine
}

const base = (over: Partial<FormSchema>): FormSchema => ({
  specVersion: '2',
  id: 'wide',
  title: 'Wide',
  model: { fields: [] },
  ...over,
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

  test('is a group of checkboxes with one accessible name for the question', () => {
    mount(schema)

    // A fieldset with a legend, exactly like the radio group: the relationship
    // is the same one, several controls answering a single question.
    const group = screen.getByRole('group', { name: 'Topics' })
    expect(within(group).getAllByRole('checkbox')).toHaveLength(3)
  })

  test('ticking builds the list of chosen values', async () => {
    const user = userEvent.setup()
    const engine = mount(schema)

    await user.click(screen.getByRole('checkbox', { name: 'Events' }))
    await user.click(screen.getByRole('checkbox', { name: 'News' }))

    // In the options' own order, not the order they were ticked, so two
    // people choosing the same answers store the same array.
    expect(engine.value()).toEqual({ topics: ['news', 'events'] })
  })

  test('unticking removes just that one', async () => {
    const user = userEvent.setup()
    const engine = mount(schema)

    await user.click(screen.getByRole('checkbox', { name: 'News' }))
    await user.click(screen.getByRole('checkbox', { name: 'Offers' }))
    await user.click(screen.getByRole('checkbox', { name: 'News' }))

    expect(engine.value()).toEqual({ topics: ['offers'] })
  })

  test('required is announced on the question, not on every box', () => {
    mount(schema)

    // "At least one" is a property of the question. On each box it would
    // announce every option as required, which is the opposite of what it says.
    const group = screen.getByRole('group', { name: 'Topics' })
    const described = (group.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())

    expect(described).toContain('required')
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box.getAttribute('aria-required')).toBeNull()
    }
  })

  test('and not with aria-required, which a group may not carry', () => {
    mount(schema)

    // `role="group"` does not support `aria-required`. Assistive technology
    // ignores it and an auditor reports it as invalid ARIA, so a requirement
    // expressed that way is a requirement nobody is told about. The
    // conformance run's axe pass is what found this.
    expect(screen.getByRole('group', { name: 'Topics' }).getAttribute('aria-required')).toBeNull()
  })
})

describe('richtext', () => {
  const schema = base({
    model: { fields: [{ key: 'notes', type: 'richtext', label: 'Notes' }] },
  })

  test('has a toolbar, and it is one tab stop rather than five', () => {
    mount(schema)

    const toolbar = screen.getByRole('toolbar', { name: 'Formatting for Notes' })
    const buttons = within(toolbar).getAllByRole('button')

    expect(buttons.map((button) => button.textContent)).toEqual([
      'BBold',
      'IItalic',
      '↗Link',
      '•Bulleted list',
      '1.Numbered list',
    ])
    // A roving tabindex: five stops between a keyboard user and the box they
    // came to type in is five too many.
    expect(buttons.filter((button) => button.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  test('Bold wraps the selection in the grammar, not in HTML', async () => {
    const user = userEvent.setup()
    mount(schema)

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    await user.type(box, 'hello there')
    box.setSelectionRange(0, 5)
    await user.click(screen.getByRole('button', { name: 'Bold' }))

    // What is stored is the grammar. There is no path from an answer to
    // innerHTML, so there is nothing here for a sanitiser to get wrong.
    expect(box.value).toBe('**hello** there')
  })

  test('pressing Bold again takes it off', async () => {
    const user = userEvent.setup()
    mount(schema)

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    await user.type(box, 'hello')
    box.setSelectionRange(0, 5)
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    box.setSelectionRange(2, 7)
    await user.click(screen.getByRole('button', { name: 'Bold' }))

    expect(box.value).toBe('hello')
  })

  test('Ctrl+B does the same thing as the button', async () => {
    const user = userEvent.setup()
    mount(schema)

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    await user.type(box, 'hello')
    box.setSelectionRange(0, 5)
    box.focus()
    await user.keyboard('{Control>}b{/Control}')

    expect(box.value).toBe('**hello**')
  })

  test('the arrow keys move along the toolbar', async () => {
    const user = userEvent.setup()
    mount(schema)

    const bold = screen.getByRole('button', { name: 'Bold' })
    bold.focus()
    await user.keyboard('{ArrowRight}')

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Italic' }))
  })

  test('a list button marks every line the selection touches', async () => {
    const user = userEvent.setup()
    mount(schema)

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'one\ntwo' } })
    box.setSelectionRange(0, 7)
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }))

    expect(box.value).toBe('- one\n- two')
  })

  test('the preview shows what the toolbar produced', async () => {
    const user = userEvent.setup()
    mount(schema)

    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    await user.type(box, 'hello')
    box.setSelectionRange(0, 5)
    await user.click(screen.getByRole('button', { name: 'Bold' }))

    // A `strong` element built from the parsed tree — the same parser the
    // form that displays this answer will use.
    await waitFor(() => {
      const preview = document.querySelector('[data-formancy-part="richtext"]')
      expect(preview?.querySelector('strong')?.textContent).toBe('hello')
    })
  })

  test('is a textarea, which every assistive technology already knows', () => {
    mount(schema)

    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA')
  })

  /**
   * Pasted, not typed. userEvent reads `[` and `{` in a typed string as the
   * start of a key descriptor, which is exactly the punctuation this grammar
   * uses — so typing a link would send keystrokes nobody meant.
   */
  const write = async (
    user: ReturnType<typeof userEvent.setup>,
    markup: string,
  ): Promise<void> => {
    await user.click(screen.getByRole('textbox', { name: 'Notes' }))
    await user.paste(markup)
  }

  test('shows what the answer will look like, parsed rather than interpreted', async () => {
    const user = userEvent.setup()
    mount(schema)

    await write(user, '**urgent**')

    expect(await screen.findByText('urgent')).toBeTruthy()
    expect(screen.getByText('urgent').tagName).toBe('STRONG')
  })

  test('a script tag somebody types is text, and stays text', async () => {
    const user = userEvent.setup()
    const engine = mount(schema)

    const typed = '<img src=x onerror=alert(1)>'
    await write(user, typed)

    await waitFor(() => expect(engine.value()).toEqual({ notes: typed }))
    // The whole reason the grammar exists: nothing downstream is ever handed a
    // string to interpret, so there is no element here to find.
    expect(document.querySelector('img')).toBeNull()
    // Two matches are correct — the textarea holds it and the preview shows it
    // — so this asks the preview specifically.
    const preview = document.querySelector('[data-formancy-part="richtext"]')
    expect(preview?.textContent).toBe(typed)
  })

  test('a javascript: link renders as the text somebody typed', async () => {
    const user = userEvent.setup()
    mount(schema)

    await write(user, '[click](javascript:alert(1))')

    await waitFor(() => expect(screen.getAllByText(/click/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('an http link is a link, and carries rel for the page that shows it', async () => {
    const user = userEvent.setup()
    mount(schema)

    await write(user, '[docs](https://example.ch)')

    const link = await screen.findByRole('link', { name: 'docs' })
    expect(link.getAttribute('href')).toBe('https://example.ch')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})

describe('file', () => {
  const schema = base({
    model: {
      fields: [
        {
          key: 'evidence',
          type: 'file',
          label: 'Evidence',
          accept: ['application/pdf'],
          maxItems: 2,
        },
      ],
    },
  })

  const stored = (name: string): StoredFile => ({
    id: `id-${name}`,
    name,
    size: 10,
    contentType: 'application/pdf',
    storageKey: `k-${name}`,
  })

  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ): Promise<void> => {
    const file = new File(['x'], name, { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Evidence'), file)
  }

  test('without an uploader it says so rather than pretending', () => {
    mount(schema)

    // A file input with nowhere to send bytes accepts a file and loses it,
    // which is worse than saying the form cannot take one.
    expect(screen.queryByLabelText('Evidence')).toBeNull()
    expect(screen.getByText(/no upload destination/)).toBeTruthy()
  })

  test('picking a file stores what it is and where it went, never the bytes', async () => {
    const user = userEvent.setup()
    const upload = vi.fn<Uploader>(async (file) => stored(file.name))
    const engine = mount(schema, upload)

    await pick(user, 'report.pdf')

    await waitFor(() => expect(engine.value()).toEqual({ evidence: [stored('report.pdf')] }))
  })

  test('each attachment gets a remove control named after it', async () => {
    const user = userEvent.setup()
    const engine = mount(schema, async (file) => stored(file.name))

    await pick(user, 'report.pdf')

    // "Remove" six times over tells a screen-reader user nothing about which
    // attachment a button kills.
    const remove = await screen.findByRole('button', { name: 'Remove report.pdf' })
    await user.click(remove)

    await waitFor(() => expect(engine.value()).toEqual({ evidence: [] }))
  })

  test('the picker offers what the field accepts', () => {
    mount(schema, async (file) => stored(file.name))

    expect(screen.getByLabelText('Evidence').getAttribute('accept')).toBe('application/pdf')
  })

  test('a file that uploaded is kept even when a later one fails', async () => {
    const user = userEvent.setup()
    // Two files, the second of which fails. The first one's bytes ARE in
    // storage by then.
    const upload = vi.fn<Uploader>(async (file) => {
      if (file.name === 'second.pdf') throw new Error('the object store is full')
      return stored(file.name)
    })
    const engine = mount(schema, upload)

    const files = [
      new File(['x'], 'first.pdf', { type: 'application/pdf' }),
      new File(['x'], 'second.pdf', { type: 'application/pdf' }),
    ]
    await user.upload(screen.getByLabelText('Evidence'), files)

    // The failure is reported, and the file that DID upload is recorded.
    // Discarding it would leave bytes in storage that the submission never
    // mentions -- collected as unclaimed within the day -- while telling
    // somebody their upload failed when half of it did not.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('second.pdf'),
    )
    expect(engine.value()).toEqual({ evidence: [stored('first.pdf')] })
  })

  test('a file dropped on the field is uploaded, the same as one picked', async () => {
    const upload = vi.fn<Uploader>(async (file) => stored(file.name))
    const engine = mount(schema, upload)

    const zone = document.querySelector('[data-formancy-part="file-dropzone"]')!
    const file = new File(['x'], 'dropped.pdf', { type: 'application/pdf' })
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })

    // A second route to the same upload, not a second implementation of it.
    await waitFor(() => expect(engine.value()).toEqual({ evidence: [stored('dropped.pdf')] }))
  })

  test('the drop zone is an addition, not a replacement for the picker', () => {
    mount(schema, async (file) => stored(file.name))

    // A drop target is a pointer gesture with no keyboard equivalent, so the
    // input has to stay: dropping cannot be the only way to attach a file.
    expect(screen.getByLabelText('Evidence')).toBeTruthy()
    expect(document.querySelector('[data-formancy-part="file-dropzone"]')).toBeTruthy()
  })

  test('dragging over says so, and says it again when the file leaves', () => {
    mount(schema, async (file) => stored(file.name))
    const zone = document.querySelector('[data-formancy-part="file-dropzone"]')!

    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'] } })
    expect(zone.getAttribute('data-state')).toBe('over')

    // Cleared on leave, or the field claims a file is hovering over it forever.
    fireEvent.dragLeave(zone)
    expect(zone.getAttribute('data-state')).toBe(null)
  })

  test('removing an attachment can be undone', async () => {
    const user = userEvent.setup()
    const engine = mount(schema, async (file) => stored(file.name))
    await pick(user, 'report.pdf')
    await screen.findByRole('button', { name: 'Remove report.pdf' })

    await user.click(screen.getByRole('button', { name: 'Remove report.pdf' }))

    // Gone from the answer straight away, so a submit in between is correct.
    await waitFor(() => expect(engine.value()).toEqual({ evidence: [] }))

    // But recoverable. The bytes are still in storage until the unclaimed
    // collector runs, and a misclick on the wrong row of six is the ordinary
    // way somebody loses the evidence they came to attach.
    await user.click(screen.getByRole('button', { name: 'Undo removing report.pdf' }))

    await waitFor(() => expect(engine.value()).toEqual({ evidence: [stored('report.pdf')] }))
  })

  test('an undone removal puts the file back where it was', async () => {
    const user = userEvent.setup()
    const engine = mount(schema, async (file) => stored(file.name))
    await pick(user, 'first.pdf')
    await pick(user, 'second.pdf')
    await screen.findByRole('button', { name: 'Remove second.pdf' })

    await user.click(screen.getByRole('button', { name: 'Remove first.pdf' }))
    await user.click(screen.getByRole('button', { name: 'Undo removing first.pdf' }))

    // Order matters for a list somebody numbered in their covering note.
    await waitFor(() =>
      expect(engine.value()).toEqual({
        evidence: [stored('first.pdf'), stored('second.pdf')],
      }),
    )
  })

  test('an upload that fails is said out loud', async () => {
    const user = userEvent.setup()
    mount(schema, async () => {
      throw new Error('the object store is full')
    })

    await pick(user, 'report.pdf')

    // A file that silently failed is a submission somebody believes carries
    // their evidence and does not.
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('the object store is full'),
    )
  })
})

describe('tabs', () => {
  const schema = base({
    model: {
      fields: [
        { key: 'first', type: 'text', label: 'First name' },
        { key: 'email', type: 'text', label: 'Email', required: true },
        { key: 'notes', type: 'textarea', label: 'Notes' },
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
              {
                kind: 'section',
                label: 'About you',
                children: [{ kind: 'field', path: 'first' }],
              },
              {
                kind: 'section',
                label: 'Contact',
                children: [{ kind: 'field', path: 'email' }],
              },
              {
                kind: 'section',
                label: 'Anything else',
                children: [{ kind: 'field', path: 'notes' }],
              },
            ],
          },
        ],
      },
    ],
  })

  test('is the ARIA tabs pattern, named by the strip', () => {
    mount(schema)

    const strip = screen.getByRole('tablist', { name: 'Application' })
    expect(within(strip).getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tabpanel')).toBeTruthy()
  })

  test('the strip is one tab stop, not one per tab', async () => {
    const user = userEvent.setup()
    mount(schema)

    await user.tab()

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'About you' }))
    expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('tabindex')).toBe('-1')
  })

  test('arrows move between tabs, Home and End reach the ends', async () => {
    const user = userEvent.setup()
    mount(schema)

    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Anything else' }).getAttribute('aria-selected')).toBe(
      'true',
    )

    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'About you' }).getAttribute('aria-selected')).toBe('true')
  })

  test('a closed panel is hidden, not unmounted', () => {
    const engine = mount(schema)

    // Tabs are presentation, unlike pages: a field in a closed tab is still
    // validated and still submitted, so it has to be there to be validated.
    // Unmounting would also throw away what somebody had typed.
    expect(engine.getFieldSnapshot(['email'])).toBeDefined()
    const panels = document.querySelectorAll('[role="tabpanel"]')
    expect(panels).toHaveLength(3)
    expect([...panels].filter((panel) => panel.hasAttribute('hidden'))).toHaveLength(2)
  })

  test('a field in a closed tab is still validated and still submitted', async () => {
    const user = userEvent.setup()
    const engine = mount(schema)

    await user.click(screen.getByRole('tab', { name: 'Anything else' }))
    const outcome = engine.submit()

    expect(outcome.ok).toBe(false)
    expect(outcome.errors['email']).toContain('required')
  })

  test('failed submit reveals the panel before focusing its control', async () => {
    mount(schema)

    // The error-summary case. Focusing a control inside a hidden panel
    // otherwise does nothing at all: the reader is told the form has an error
    // and sent nowhere.
    // `hidden: true`, because the control genuinely is hidden right now — that
    // is the situation being tested, and the default query would not find it.
    const email = screen.getByRole('textbox', { name: 'Email', hidden: true })
    const focus = email.focus.bind(email)
    email.focus = () => {
      expect(email.closest('[hidden]')).toBeNull()
      focus()
    }
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }))
    expect(document.activeElement).toBe(email)

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Contact' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    )
  })

  test('clicking a tab shows its panel and hides the others', async () => {
    const user = userEvent.setup()
    mount(schema)

    await user.click(screen.getByRole('tab', { name: 'Anything else' }))

    const open = screen.getAllByRole('tabpanel').filter((panel) => !panel.hasAttribute('hidden'))
    expect(open).toHaveLength(1)
    expect(within(open[0]!).getByRole('textbox', { name: 'Notes' })).toBeTruthy()
  })
})

describe('table', () => {
  const schema = base({
    model: {
      fields: [
        { key: 'a', type: 'text', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
        { key: 'c', type: 'text', label: 'C' },
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
              { kind: 'field', path: 'c' },
            ],
          },
        ],
      },
    ],
  })

  test('is a labelled group, and not a <table>', () => {
    const { container } = render(<div />)
    cleanup()
    mount(schema)

    // Laying fields out in a grid is not tabular data, and marking it up as a
    // table would announce rows and columns that mean nothing (WCAG 1.3.1).
    expect(screen.getByRole('group', { name: 'Measurements' })).toBeTruthy()
    expect(document.querySelector('table')).toBeNull()
    expect(container).toBeDefined()
  })

  test('declares its column count for the stylesheet, which is what aligns them', () => {
    mount(schema)

    const grid = screen.getByRole('group', { name: 'Measurements' })
    // The count is data, not a class: the stylesheet turns it into a grid, so
    // a narrow viewport can collapse it with a media query rather than script.
    expect(grid.getAttribute('data-columns')).toBe('2')
  })

  test('places every field it holds, in order', () => {
    mount(schema)

    const grid = screen.getByRole('group', { name: 'Measurements' })
    expect(within(grid).getAllByRole('textbox').map((input) => input.getAttribute('name'))).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
