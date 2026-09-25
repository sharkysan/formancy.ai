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
 * Scoped because the page deliberately shows the same document three ways —
 * as JSON, as a tree and as a form — so an unscoped query finds the schema
 * text when it meant the rendered field. The required marker is a theme's
 * ::after, so accessible names here have no asterisk.
 */
const form = (): HTMLElement =>
  screen.getByRole('heading', { name: 'Form' }).closest('section') as HTMLElement

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
