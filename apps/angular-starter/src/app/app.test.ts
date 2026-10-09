import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { StarterApp } from './app'
import { EXPENSE_CLAIM } from './expense-claim'

/**
 * The starter, as somebody who cloned it meets it: the builder and the form it builds, the
 * form drawn with Angular Material, filled in and submitted — and an edit in the builder
 * reaching the form, which is the whole point of the two panes.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
  localStorage.clear()
})

async function open() {
  const view = await render(StarterApp, { providers: [provideZonelessChangeDetection()] })
  await view.fixture.whenStable()
  const fill = screen.getByRole('region', { name: 'Fill in' })
  const settle = async (): Promise<void> => {
    await view.fixture.whenStable()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await view.fixture.whenStable()
  }
  return { fill, settle }
}

describe('the Angular starter', () => {
  test('opens on the expense claim, built on the left and drawn with Material on the right', async () => {
    const { fill } = await open()

    expect(screen.getByRole('heading', { level: 1, name: 'Expense claim' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Build' })).getByRole('tree')).toBeTruthy()
    expect(within(fill).getByLabelText('Your name').closest('mat-form-field')).not.toBeNull()
    // A receipt is a file, which Material has no control for: the default one draws it,
    // and it takes a file because the starter supplies an uploader.
    const receipt = within(fill).getByLabelText('Receipt')
    expect(receipt.getAttribute('type')).toBe('file')
    expect(receipt.closest('mat-form-field')).toBeNull()
  })

  test('asks why only when an expense is over CHF 500, and not on a form nobody has touched', async () => {
    // A row nobody has typed into has no amount yet; without has() the rule would throw,
    // and a visible rule that throws shows the field it was meant to hide.
    const { fill, settle } = await open()
    expect(within(fill).queryByLabelText('Why is an expense more than CHF 500?')).toBeNull()

    fireEvent.input(within(fill).getByLabelText('Amount (CHF)'), { target: { value: '600' } })
    await settle()

    expect(within(fill).getByLabelText('Why is an expense more than CHF 500?')).toBeTruthy()
  })

  test('a claim filled in and submitted is shown as the data a server would receive', async () => {
    const { fill, settle } = await open()

    const type = (label: string, value: string): void => {
      fireEvent.input(within(fill).getByLabelText(label), { target: { value } })
    }
    type('Your name', 'Ada Lovelace')
    type('Email', 'ada@example.org')
    fireEvent.change(within(fill).getByLabelText('Department'), {
      target: { value: 'engineering' },
    })
    type('Date of travel', '2026-10-09')
    fireEvent.click(
      within(within(fill).getByRole('group', { name: 'Purpose' })).getByLabelText('Conference'),
    )
    type('What', 'Train to Zurich')
    type('Amount (CHF)', '84.5')
    fireEvent.click(within(fill).getByLabelText('These expenses are correct'))
    await settle()
    fireEvent.click(within(fill).getByRole('button', { name: 'Submit claim' }))
    await settle()

    const result = await screen.findByRole('region', { name: 'Submitted' })
    const data = JSON.parse(within(result).getByText(/Ada Lovelace/).textContent ?? '{}')
    expect(data).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.org',
      department: 'engineering',
      travelled: '2026-10-09',
      purpose: 'conference',
      items: [{ what: 'Train to Zurich', amount: 84.5 }],
      confirm: true,
    })
  })

  test('an edit in the builder reaches the form being filled in', async () => {
    const { fill, settle } = await open()
    const build = screen.getByRole('region', { name: 'Build' })

    fireEvent.click(within(build).getByRole('treeitem', { name: /Your name/ }))
    await settle()
    const label = within(build).getByRole('textbox', { name: 'Label' })
    fireEvent.input(label, { target: { value: 'Full name' } })
    fireEvent.change(label, { target: { value: 'Full name' } })
    fireEvent.blur(label)
    await settle()

    await waitFor(() => expect(within(fill).getByLabelText('Full name')).toBeTruthy())
  })
})

/**
 * Saving the form somebody built, and opening it again. Where it is kept is the host's — this
 * app keeps it in the browser's own storage, in `saved-form.ts` — and what is shown is that a
 * document goes out as JSON and comes back as the same builder session.
 */
describe('saving and reloading the form', () => {
  /** The starter's form with its first field removed: an edit somebody could have made. */
  const edited = {
    ...EXPENSE_CLAIM,
    title: 'Travel claim',
    model: { fields: EXPENSE_CLAIM.model.fields.slice(1) },
  }

  test('Save keeps the document being built', async () => {
    const { settle } = await open()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await settle()

    expect(JSON.parse(localStorage.getItem('formancy-starter:form') ?? 'null')).toEqual(EXPENSE_CLAIM)
    expect(within(screen.getByRole('banner')).getByRole('status').textContent).toContain('Saved')
  })

  test('Save and Reload saved are Material’s buttons, as the form’s controls are', async () => {
    // Native buttons beside Material's fields made the page look like two applications.
    // The class is Material's own mark on every button it draws.
    await open()

    for (const name of ['Save', 'Reload saved']) {
      expect(screen.getByRole('button', { name }).classList).toContain('mat-mdc-button-base')
    }
  })

  test('and the app opens on what was saved', async () => {
    localStorage.setItem('formancy-starter:form', JSON.stringify(edited))

    const { fill } = await open()

    expect(screen.getByRole('heading', { level: 1, name: 'Travel claim' })).toBeTruthy()
    expect(within(fill).queryByLabelText('Your name')).toBeNull()
  })

  test('Reload saved puts it back without restarting the app', async () => {
    const { fill, settle } = await open()
    localStorage.setItem('formancy-starter:form', JSON.stringify(edited))

    fireEvent.click(screen.getByRole('button', { name: 'Reload saved' }))
    await settle()

    expect(screen.getByRole('heading', { level: 1, name: 'Travel claim' })).toBeTruthy()
    expect(within(fill).queryByLabelText('Your name')).toBeNull()
  })

  test('but something saved that is no longer a valid form is not opened', async () => {
    // A session refuses an invalid document by throwing, so an app opening whatever it found
    // would not start at all — because of something it wrote itself, yesterday.
    localStorage.setItem('formancy-starter:form', JSON.stringify({ ...edited, specVersion: '99' }))

    await open()

    expect(screen.getByRole('heading', { level: 1, name: 'Expense claim' })).toBeTruthy()
  })
})
