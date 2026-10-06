import { afterEach, beforeAll, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { TemplateGallery } from './template-gallery.js'

beforeAll(() => {
  // jsdom has no modal top layer; the real browser gate checks opening/closing.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(cleanup)

test('the catalogue can be filtered and a template downloaded without entering the editor', async () => {
  // A landing page that sends every action to the playground is not a template library.
  const user = userEvent.setup()
  render(<TemplateGallery />)
  await user.click(screen.getByRole('button', { name: 'HR' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
  await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'leave')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Download Leave request JSON' }).getAttribute('download')).toBe('leave-request.form.json')
  expect(screen.getByRole('link', { name: 'Edit Leave request in playground' }).getAttribute('href')).toContain('template=hr-leave-request')
})

test('a preview is a real translated form, with conditional fields and no submission endpoint', async () => {
  // A screenshot would not reveal a hidden branch that cannot be completed.
  const user = userEvent.setup()
  render(<TemplateGallery />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Template language' }), 'de')
  await user.click(screen.getByRole('button', { name: 'Preview Verkaufsanfrage' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Verkaufsanfrage' }))
  expect(dialog.getByRole('textbox', { name: 'Vor- und Nachname' })).toBeTruthy()
  expect(dialog.queryByRole('textbox', { name: 'Telefonnummer' })).toBeNull()
  await user.click(dialog.getByRole('radio', { name: 'Telefon' }))
  expect(dialog.getByRole('textbox', { name: 'Telefonnummer' })).toBeTruthy()
  await user.click(dialog.getByRole('button', { name: 'Check answers' }))
  expect(dialog.getByRole('status').textContent).toContain('required')
  await user.click(dialog.getByRole('button', { name: 'Close preview' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('an empty search has a recovery action', async () => {
  // A filter that hides everything must not leave an unexplained blank page.
  const user = userEvent.setup()
  render(<TemplateGallery />)
  await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'no-such-template')
  expect(screen.getByText('No templates match your search.')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
})
