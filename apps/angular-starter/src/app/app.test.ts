import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { StarterApp } from './app'

/**
 * The starter, as somebody who cloned it meets it: the builder and the form it builds, the
 * form drawn with Angular Material, filled in and submitted — and an edit in the builder
 * reaching the form, which is the whole point of the two panes.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
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
