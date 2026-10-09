import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

/**
 * The playground is the whole thesis on one screen, which makes it the one
 * page where a regression is visible to everybody evaluating the project. So
 * these are not a test of the panes — each of those is tested in its own
 * package — but of the claims the page exists to make:
 *
 * one schema renders a real form; the builder and the form are two views of
 * one document and cannot disagree; the arrangement can be edited by keyboard;
 * and switching locale or theme changes the form without touching a component.
 */
vi.mock('@monaco-editor/react', () => ({
  // Monaco loads a worker and measures a DOM jsdom does not have. The JSON
  // editor is not what any of this is about.
  default: ({ value }: { value?: string }) => <textarea readOnly aria-label="Schema" value={value ?? ''} />,
  useMonaco: () => null,
}))

afterEach(cleanup)

const arrangementTree = (): HTMLElement => screen.getByRole('tree', { name: /Arrangement/ })

/**
 * The preview pane alone.
 *
 * Scoped because the page deliberately shows the same document four ways — as
 * JSON, as a tree, and as a rendered form under EACH renderer — so an unscoped
 * query finds the schema text when it meant the field, or finds the field twice.
 * The required marker is a theme's ::after, so accessible names here have no
 * asterisk.
 *
 * This returns the React one. Both renderers are regions with accessible names
 * for exactly this reason, and `angularForm` below is the same question asked of
 * the other half.
 */
const form = (): HTMLElement => screen.getByRole('region', { name: 'React' })

/** The same document, under the other renderer. */
const angularForm = (): HTMLElement => screen.getByRole('region', { name: 'Angular' })

describe('the file field', () => {
  test('can actually accept a file, because the app provides an uploader', async () => {
    // The bug this exists for: the playground provided a rich-text editor and no uploader,
    // so the one field a visitor most wants to try rendered read-only and said there was
    // nowhere to put a file. It was correct behaviour for a missing uploader and the wrong
    // thing for a demo.
    render(<App />)
    await waitFor(() => {
      expect(screen.queryAllByRole('textbox').length).toBeGreaterThan(0)
    })

    // The file field is HIDDEN until gift wrapping is chosen -- there is a visibility rule
    // on it, which is the second reason it looked broken. Ticking the option is therefore
    // part of the test rather than setup noise: it exercises the conditional and gets to
    // the field in one go.
    //
    // The first version of this test waited for the message "no upload destination has been
    // configured" to be ABSENT, which it is while the field is hidden and while the form has
    // not rendered at all. A vacuous pass that would have survived removing the uploader
    // again, which is exactly the bug it was written for.
    // Scoped to the React renderer: the page shows the document under both, so
    // the unscoped query found the checkbox twice and could not say which form
    // it was about to tick.
    const react = within(form())
    await userEvent.click(react.getByRole('checkbox', { name: 'Gift wrapping' }))

    const picker = await waitFor(() => {
      const found = form().querySelector('input[type="file"]')
      expect(found, 'the file field did not appear').not.toBeNull()
      return found
    })
    expect(picker).not.toBeNull()

    // And the read-only message is gone, which is the thing the uploader changes.
    expect(react.queryByText(/no upload destination has been configured/i)).toBeNull()
  })

  /** What the field hands an uploader: nothing cancelled, progress ignored. */
  const sending = () => ({
    field: 'evidence',
    signal: new AbortController().signal,
    onProgress: () => {},
  })

  test('records where the bytes went, and does not pretend they left the tab', async () => {
    // The landing page's uploader says the bytes went nowhere because it is a pitch; this
    // one keeps them for the session and says so. Either way the storage key must be
    // something no server would recognise — a plausible-looking key would make the demo
    // read better and make the product look like it silently drops files.
    const { playgroundUploader } = await import('./demo-uploader.js')
    const stored = await playgroundUploader(
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
      sending(),
    )
    expect(stored.storageKey).toMatch(/^playground:in-this-tab\//)
    expect(stored.name).toBe('note.txt')
    expect(stored.size).toBe(5)
  })

  test('says what an unrecognised file is rather than nothing at all', async () => {
    // A browser leaves `type` empty for a type it does not know, and a submission that says
    // nothing about what was attached is worse than one saying it could not tell.
    const { playgroundUploader } = await import('./demo-uploader.js')
    const stored = await playgroundUploader(new File(['x'], 'mystery.qqq', { type: '' }), sending())
    expect(stored.contentType).toBe('application/octet-stream')
  })

  test('reports the copy into the tab as it goes, so the progress bar is of real work', async () => {
    const { playgroundUploader } = await import('./demo-uploader.js')
    const progress: Array<[number, number]> = []
    const big = new File([new Uint8Array(600 * 1024)], 'scan.tiff', { type: 'image/tiff' })

    await playgroundUploader(big, { ...sending(), onProgress: (sent, total) => progress.push([sent, total]) })

    // Pieces of 256 KiB: three reports, the last of them the whole file.
    expect(progress).toEqual([
      [256 * 1024, big.size],
      [512 * 1024, big.size],
      [big.size, big.size],
    ])
  })

  test('stops copying when cancelled, and attaches nothing', async () => {
    const { playgroundUploader } = await import('./demo-uploader.js')
    const controller = new AbortController()
    const big = new File([new Uint8Array(600 * 1024)], 'scan.tiff', { type: 'image/tiff' })
    const pieces: number[] = []

    const copying = playgroundUploader(big, {
      field: 'evidence',
      signal: controller.signal,
      onProgress: (sent) => {
        pieces.push(sent)
        controller.abort()
      },
    })

    await expect(copying).rejects.toThrow('Cancelled.')
    expect(pieces).toEqual([256 * 1024])
  })
})

describe('the page', () => {
  test('renders the starter form from its schema', () => {
    render(<App />)

    expect(within(form()).getByLabelText('First name')).toBeTruthy()
    expect(within(form()).getByRole('button', { name: 'Submit' })).toBeTruthy()
  })

  test('has a way out to the source', () => {
    render(<App />)

    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link.getAttribute('href')).toBe('https://github.com/sharkysan/formancy.ai')
  })

  test('has a way back to the landing page', () => {
    render(<App />)

    // Absolute in development, where the site and the playground are two Vite
    // servers and a relative path would land on this app's own root.
    const link = screen.getByRole('link', { name: 'formancy.ai' })
    expect(link.getAttribute('href')).toBe('http://localhost:4384/')
  })

  test('on a narrow screen, one pane is shown at a time, and the form first', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    // The switch only displays below 64rem, which jsdom cannot show; what can
    // be checked is that it drives the panes and says which one is chosen.
    const switchNav = screen.getByRole('navigation', { name: 'Pane' })
    const panes = container.querySelector('.panes') as HTMLElement
    expect(panes.dataset['shown']).toBe('form')
    expect(within(switchNav).getByRole('button', { name: 'Form' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    await user.click(within(switchNav).getByRole('button', { name: 'Engine' }))

    expect(panes.dataset['shown']).toBe('engine')
    expect(
      within(switchNav).getByRole('button', { name: 'Engine' }).getAttribute('aria-controls'),
    ).toBe('pane-engine')
    expect(container.querySelector('#pane-engine')).toBeTruthy()
  })

  test('shows the engine state, not a screenshot of it', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Submission value' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fields the engine is tracking' })).toBeTruthy()
  })
})

describe('the builder and the form are one document', () => {
  test('the structure tree lists what the form renders', () => {
    render(<App />)

    const tree = screen.getByRole('tree', { name: 'Form structure' })
    expect(within(tree).getByRole('treeitem', { name: 'First name' })).toBeTruthy()
  })

  test('removing a field removes it from the form as well', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(within(form()).getByLabelText('Notes')).toBeTruthy()

    const notes = screen.getByRole('treeitem', { name: 'Notes' })
    notes.focus()
    await user.keyboard('{Delete}')

    // Not "the tree updated": the point of the page is that the rendered form
    // follows the same document, through the JSON, with nothing wired by hand.
    await waitFor(() => expect(within(form()).queryByLabelText('Notes')).toBeNull())
  })
})

describe('the arrangement', () => {
  const openArrangement = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.click(screen.getByRole('button', { name: 'Arrangement' }))
  }

  test('is a second editor over the same document', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openArrangement(user)

    expect(within(arrangementTree()).getAllByRole('treeitem', { name: /Row with/ })[0]).toBeTruthy()
    // The structure tree is put away rather than shown beside it: the two
    // answer different questions and one list showing both would pretend they
    // are the same question.
    expect(screen.queryByRole('tree', { name: 'Form structure' })).toBeNull()
  })

  test('moving a row by keyboard moves it in the rendered form', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArrangement(user)

    // Email sits on its own; moving it to the top of the layout puts it above
    // the first section in the rendered form, which is the claim being made.
    const email = within(arrangementTree()).getByRole('treeitem', { name: 'Email' })
    email.focus()
    await user.keyboard('m')

    const dialog = await screen.findByRole('dialog', { name: 'Move Email' })
    await user.click(within(dialog).getAllByRole('button')[0]!)

    await waitFor(() =>
      expect(within(arrangementTree()).getAllByRole('treeitem')[0]?.textContent).toBe('Email'),
    )
    const fields = [...form().querySelectorAll('[data-formancy-part="label"]')].map(
      (element) => element.textContent,
    )
    expect(fields[0]).toBe('Email')
  })

  test('names the fields it leaves out, because they are invisible in the form', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArrangement(user)

    // The starter schema deliberately leaves one field unplaced, so the
    // warning this pane exists to give is visible on first load.
    expect(screen.getByRole('heading', { name: 'Not in this arrangement' })).toBeTruthy()
  })
})

describe('the switchers', () => {
  test('a locale change re-labels the form without changing a component', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('Language'), 'de')

    await waitFor(() => expect(within(form()).getByLabelText('Vorname')).toBeTruthy())
  })

  test('a partial catalogue falls back rather than showing message ids', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('Language'), 'fr')

    // French is deliberately incomplete. The untranslated labels have to stay
    // readable English, not turn into `field.notes.label`.
    await waitFor(() => expect(within(form()).getByLabelText('Prénom')).toBeTruthy())
    // Untranslated labels stay readable English rather than turning into ids.
    expect(within(form()).getByLabelText('Notes')).toBeTruthy()
    expect(within(form()).queryByText(/\$t|field\..*\.label/)).toBeNull()
  })

  test('four themes that do not look related', () => {
    render(<App />)

    const options = [...screen.getByLabelText<HTMLSelectElement>('Theme').options].map(
      (option) => option.value,
    )
    expect(options).toEqual(['blueprint', 'dusk', 'pop', 'paper'])
  })

  test('a theme change touches the sheet, not the markup', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await user.selectOptions(screen.getByLabelText('Theme'), 'dusk')

    // The renderers ship no CSS; a theme is a scoped stylesheet over the same
    // data-formancy-part hooks. If this ever needs a remount, that claim is
    // no longer true.
    expect(container.querySelector('[data-formancy-theme="dusk"]')).toBeTruthy()
  })
})

describe('the second demo, which is the one with steps', () => {
  /*
   * Asked for directly: *"is there a demo for all that in the playground? always
   * add a demo"* — about the wizard work, which had tests, documents, decision
   * records and nowhere to see it working. Measured before this existed: the
   * playground held no `page` and no `group` at all, because the starter is one
   * flat form on purpose. So it never drew a stepper, never showed a step being
   * walked past, and gave the builder's container commands nothing to act on.
   *
   * A second document rather than a change to the starter. The starter's own
   * test holds it to every field type **minus the two that nest**, and that
   * exclusion is the reason it works: one flat form with every control visible at
   * once. Adding a page would take that away to demonstrate a page.
   */
  const pick = async (user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> => {
    await user.selectOptions(screen.getByRole('combobox', { name: /demo/i }), label)
  }

  /**
   * Answer step one, which is required-gated.
   *
   * Not a workaround. `canGoNext` validates the page being left, so a wizard whose
   * first step has required answers cannot be walked past without them — which is
   * the behaviour, and is why every case below that wants step three says so out
   * loud instead of arriving there by accident.
   */
  const answerStepOne = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
    await user.type(within(form()).getByLabelText('Full name'), 'Mara Keller')
    await user.type(within(form()).getByLabelText('Work email'), 'mara@example.ch')
  }

  test('is offered, and the flat form is what the page still opens on', () => {
    render(<App />)

    // The starter first: somebody arriving wants the shortest path to a control
    // they recognise, not a form that asks them to press Next.
    expect(within(form()).getByLabelText('First name')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /demo/i })).toBeTruthy()
  })

  test('renders a stepper, which no demo here has ever shown', async () => {
    const user = userEvent.setup()
    render(<App />)

    await pick(user, 'wizard')

    // The step names come from the catalogue, so this is also the locale
    // switcher having something to do on this document.
    expect(await within(form()).findByText('About you')).toBeTruthy()
    expect(within(form()).getByRole('button', { name: /next/i })).toBeTruthy()
  })

  test('walks past the skipped step, and stops when the answer changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pick(user, 'wizard')

    await answerStepOne(user)

    // Untouched, the visa box is off and the visa step is not there: `skip` walks
    // past a page while its condition holds and hides the fields on it.
    await user.click(within(form()).getByRole('button', { name: /next/i }))
    expect(within(form()).queryByLabelText(/passport number/i)).toBeNull()
    expect(within(form()).getByLabelText(/cost centre reference/i)).toBeTruthy()

    // Back, tick it, and the step exists.
    await user.click(within(form()).getByRole('button', { name: /back/i }))
    await user.click(within(form()).getByLabelText(/need a visa/i))
    await user.click(within(form()).getByRole('button', { name: /next/i }))

    expect(within(form()).getByLabelText(/passport number/i)).toBeTruthy()
  })

  test('answers its own check, so the field is not stuck on an error nobody can clear', async () => {
    // The documented-but-inert failure this demo could most easily have shipped:
    // a `check` names a validator the DEPLOYMENT answers, and a document naming
    // one nothing answers fails closed. Here the playground is the deployment.
    const user = userEvent.setup()
    render(<App />)
    await pick(user, 'wizard')

    // Straight to the last step, which is reachable because the middle one is
    // skipped while the visa box is off.
    await answerStepOne(user)
    await user.click(within(form()).getByRole('button', { name: /next/i }))
    const reference = within(form()).getByLabelText(/cost centre reference/i)
    await user.type(reference, 'FM-1234')
    await user.tab()

    // It takes a moment on purpose — that is the one thing only a check does —
    // and then the answer is accepted rather than left refused.
    await waitFor(() => {
      expect(reference.getAttribute('aria-busy')).toBeNull()
    })
    expect(within(form()).queryByText(/unknownReference/)).toBeNull()
  })

  test('and refuses a reference this deployment does not know', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pick(user, 'wizard')

    await answerStepOne(user)
    await user.click(within(form()).getByRole('button', { name: /next/i }))
    await user.type(within(form()).getByLabelText(/cost centre reference/i), 'nonsense')
    await user.tab()

    // The code the rule returns, shown as the renderers show codes. A check that
    // accepted everything would demonstrate the wiring and not the feature.
    expect(await within(form()).findByText(/unknownReference/)).toBeTruthy()
  })

  test('gives the builder a container to take away, which is what `u` is for', async () => {
    const user = userEvent.setup()
    render(<App />)
    await pick(user, 'wizard')
    await user.click(screen.getByRole('button', { name: 'Build' }))

    // The structure tree lists the pages, so the commands that only apply to a
    // container finally have something to apply to. It also has to be THIS
    // document: the session is opened once and a demo switch has to re-open it,
    // or the form follows the picker and the tree does not.
    const tree = screen.getByRole('tree', { name: /structure/i })
    const items = within(tree).getAllByRole('treeitem').map((item) => item.textContent)
    expect(items).toContain('About you')
    expect(items).not.toContain('First name')
  })
})
