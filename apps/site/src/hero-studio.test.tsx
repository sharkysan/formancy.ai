import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { HeroStudio } from './hero-studio.js'

afterEach(cleanup)

test('editing the preview preserves the answers already entered', async () => {
  // Adding a question must not silently throw away the visitor's answers.
  const user = userEvent.setup()
  render(<HeroStudio playground="/playground/" />)
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Alex')
  await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'alex@example.com')
  await user.click(screen.getByRole('button', { name: 'Add company field' }))
  expect(screen.getByRole('textbox', { name: 'Your company' })).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Your name' }) as HTMLInputElement).value).toBe('Alex')
  await user.click(screen.getByRole('button', { name: 'Remove company field' }))
  expect(screen.queryByRole('textbox', { name: 'Your company' })).toBeNull()
  expect((screen.getByRole('textbox', { name: 'Work email' }) as HTMLInputElement).value).toBe('alex@example.com')
})

test('checks required answers without pretending to submit them', async () => {
  // An empty demo must not announce success, nor suggest its answers were saved.
  const user = userEvent.setup()
  render(<HeroStudio playground="/playground/" />)
  await user.click(screen.getByRole('button', { name: 'Check this form' }))
  expect(await screen.findByText('Complete the required fields to continue.')).toBeTruthy()
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Alex')
  await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'alex@example.com')
  await user.click(screen.getByRole('button', { name: 'Check this form' }))
  expect(await screen.findByText('Looks good. Nothing was sent.')).toBeTruthy()
})

test('the appearance controls select an actual renderer theme', async () => {
  // A pressed state alone would make a convincing but inert theme switch.
  const user = userEvent.setup()
  render(<HeroStudio playground="/playground/" />)
  await user.click(screen.getByRole('button', { name: 'Dark preview' }))
  const field = screen.getByRole('textbox', { name: 'Your name' })
  expect(field.closest('[data-formancy-theme]')?.getAttribute('data-formancy-theme')).toBe('dusk')
  await user.click(screen.getByRole('button', { name: 'Light preview' }))
  expect(field.closest('[data-formancy-theme]')?.getAttribute('data-formancy-theme')).toBe('paper')
  expect(screen.getByRole('link', { name: /Open full editor/ }).getAttribute('href')).toBe('/playground/')
})
