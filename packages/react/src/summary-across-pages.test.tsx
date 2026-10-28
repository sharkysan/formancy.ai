import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { ErrorSummary, FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * The error summary on a paged form (0205): a link to a question on another page goes to that
 * page and focuses the question. It focused by element id alone, and a question on a page not
 * drawn has no element — so the link did nothing, and the person was stranded on a list of
 * problems they could not reach.
 *
 * A send that fails lists every page's problems while showing the first page with one. Next
 * checks the page it leaves, so a problem on an earlier page arrives through a rule: here the
 * phone number is required once a later page says to call.
 */
const CLOCK = { now: () => 0, today: () => '2026-10-28', random: () => 0.5 }

const form: FormSchema = {
  specVersion: '5',
  id: 'call',
  title: 'Call',
  model: {
    fields: [
      { key: 'you', type: 'page', label: 'You', fields: [{ key: 'phone', type: 'text', label: 'Phone' }] },
      {
        key: 'how',
        type: 'page',
        label: 'How',
        fields: [
          { key: 'call', type: 'checkbox', label: 'Call me' },
          { key: 'when', type: 'text', label: 'When', required: true },
        ],
      },
    ],
  },
  logic: { rules: [{ target: 'phone', kind: 'required', cel: 'call == true' }] },
}

describe('the error summary on a paged form', () => {
  test('takes a link to a question on another page to that page, and focuses it', async () => {
    render(
      <FormancyProvider engine={createFormEngine({ schema: form, capabilities: CLOCK })}>
        <ErrorSummary />
        <FormancyForm />
      </FormancyProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Call me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    // The send failed and went to the first page with a problem; the summary lists both.
    await screen.findByRole('textbox', { name: 'Phone' })
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /^When/ }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'When' }))

    // And back again, to the page it started on.
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /^Phone/ }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Phone' }))
  })
})
