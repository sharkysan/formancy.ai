import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { App } from './app.js'

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value?: string }) => <textarea readOnly aria-label="Schema" value={value ?? ''} />,
  useMonaco: () => null,
}))
afterEach(cleanup)

test('an imported template reaches both renderers, including its translated conditional', async () => {
  // A catalogue in the repository is not a demonstration. Loading it must replace
  // the actual document, and both renderers must observe the same rules and labels.
  const user = userEvent.setup()
  render(<App />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'sales-lead-enquiry')
  await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'de')
  for (const name of ['React', 'Angular']) {
    const form = within(screen.getByRole('region', { name }))
    await waitFor(() => expect(form.getByRole('textbox', { name: 'Vor- und Nachname' })).toBeTruthy())
    expect(form.queryByRole('textbox', { name: 'Telefonnummer' })).toBeNull()
    await user.click(form.getByRole('radio', { name: 'Telefon' }))
    await waitFor(() => expect(form.getByRole('textbox', { name: 'Telefonnummer' })).toBeTruthy())
  }
  // Native radio selection must not uncheck the other renderer's answer.
  const react = within(screen.getByRole('region', { name: 'React' }))
  const angular = within(screen.getByRole('region', { name: 'Angular' }))
  await user.click(angular.getByRole('radio', { name: 'E-Mail' }))
  expect((react.getByRole('radio', { name: 'Telefon' }) as HTMLInputElement).checked).toBe(true)
  expect((angular.getByRole('radio', { name: 'E-Mail' }) as HTMLInputElement).checked).toBe(true)
  // Previewing must not turn Enter or an implicit submit into a page navigation.
  for (const name of ['React form preview', 'Angular form preview']) {
    const event = new Event('submit', { bubbles: true, cancelable: true })
    screen.getByRole('form', { name }).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
})

test('loading a template starts blank instead of submitting the example person', async () => {
  // Samples are documentation, never defaults in a form somebody might publish.
  const user = userEvent.setup()
  render(<App />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Demo' }), 'hr-job-application')
  const form = within(screen.getByRole('region', { name: 'React' }))
  await waitFor(() => expect(form.getByRole('textbox', { name: 'Full name' })).toBeTruthy())
  expect((form.getByRole('textbox', { name: 'Full name' }) as HTMLInputElement).value).toBe('')
  expect(screen.getAllByRole('option').some((option) => option.textContent === 'HR — Job application')).toBe(true)
})

test('a gallery link opens its template and language on first load', async () => {
  // Testing the query parser alone cannot catch an App that never calls it.
  const before = window.location.href
  window.history.replaceState({}, '', '?template=hr-job-application&locale=fr')
  try {
    render(<App />)
    const form = within(screen.getByRole('region', { name: 'React' }))
    await waitFor(() => expect(form.getByRole('textbox', { name: 'Prénom et nom' })).toBeTruthy())
    expect((screen.getByRole('combobox', { name: 'Demo' }) as HTMLSelectElement).value).toBe('hr-job-application')
    expect((screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement).value).toBe('fr')
  } finally {
    window.history.replaceState({}, '', before)
  }
})
