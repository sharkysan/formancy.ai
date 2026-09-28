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

test('every appearance the packages ship selects an actual renderer theme', async () => {
  // A pressed state alone would make a convincing but inert theme switch — and the
  // claim the page makes is about FOUR stylesheets over one markup, so offering two
  // of them would be making a smaller claim than the product supports.
  const user = userEvent.setup()
  render(<HeroStudio playground="/playground/" />)
  const field = screen.getByRole('textbox', { name: 'Your name' })

  for (const [name, theme] of [
    ['Blueprint', 'blueprint'],
    ['Dusk', 'dusk'],
    ['Pop', 'pop'],
    ['Paper', 'paper'],
  ]) {
    await user.click(screen.getByRole('button', { name: name as string }))
    expect(
      field.closest('[data-formancy-theme]')?.getAttribute('data-formancy-theme'),
      name as string,
    ).toBe(theme)
  }

  expect(screen.getByRole('link', { name: /Open full editor/ }).getAttribute('href')).toBe('/playground/')
})

test('the pass decides what the form asks and what it totals', async () => {
  // The two engine behaviours the page is about, in the form it opens with: a rule
  // that shows a field and a rule that computes a value. Both run in the browser with
  // nothing sent anywhere, which is the claim underneath the whole page.
  const user = userEvent.setup()
  render(<HeroStudio playground="/playground/" />)

  expect(screen.queryByRole('group', { name: 'Workshops' })).toBeNull()
  expect((screen.getByRole('spinbutton', { name: 'Total, CHF' }) as HTMLInputElement).value).toBe(
    '490',
  )

  await user.click(screen.getByRole('radio', { name: 'Conference and workshops' }))

  expect(screen.getByRole('group', { name: 'Workshops' })).toBeTruthy()
  expect((screen.getByRole('spinbutton', { name: 'Total, CHF' }) as HTMLInputElement).value).toBe(
    '790',
  )
})

test('the total is the engine’s, not something a visitor can type over', async () => {
  render(<HeroStudio playground="/playground/" />)

  expect((screen.getByRole('spinbutton', { name: 'Total, CHF' }) as HTMLInputElement).disabled).toBe(
    true,
  )
})
