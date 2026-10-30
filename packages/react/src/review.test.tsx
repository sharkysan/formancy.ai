import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'
import type { FormancyFormProps } from './index.js'

afterEach(cleanup)

/**
 * Checking the answers before they are sent (0204): where the form asks for it, the last step
 * offers "Check your answers" instead of sending; the answers are shown in words, each with a way
 * back to its question; and only then is the form sent.
 */
const paged: FormSchema = {
  specVersion: '5',
  id: 'trip',
  title: 'Trip',
  model: {
    fields: [
      {
        key: 'about',
        type: 'page',
        label: 'About you',
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'country', type: 'select', label: 'Country', options: [{ value: 'CH', label: 'Switzerland' }] },
        ],
      },
      { key: 'stay', type: 'page', label: 'Your stay', fields: [{ key: 'nights', type: 'number', label: 'Nights' }] },
    ],
  },
}

const mount = (schema: FormSchema, props: Partial<FormancyFormProps>, initialValue?: Record<string, unknown>) => {
  const sent: unknown[] = []
  const engine = createFormEngine({ schema, ...(initialValue === undefined ? {} : { initialValue }) })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm {...props} onSubmit={(outcome) => sent.push(outcome)} />
    </FormancyProvider>,
  )
  return { engine, sent }
}

/** Next validates the page before moving, which settles after the click. */
const toLastPage = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('spinbutton', { name: 'Nights' })
}

describe('checking the answers', () => {
  test('is offered on the last step in place of sending, and shows every answer in words', async () => {
    const { sent } = mount(paged, { review: true }, { name: 'Ada', country: 'CH', nights: 3 })
    await toLastPage()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check your answers' }))

    // Focus goes to the heading, so a screen reader says where the person now is.
    const heading = screen.getByRole('heading', { name: 'Check your answers before you send them' })
    expect(document.activeElement).toBe(heading)
    const terms = screen.getAllByRole('term').map((term) => term.textContent)
    const answers = screen
      .getAllByRole('definition')
      .map((definition) => definition.textContent)
      .filter((said) => !said?.startsWith('Change'))
    expect(terms).toEqual(['Name', 'Country', 'Nights'])
    expect(answers).toEqual(['Ada', 'Switzerland', '3'])
    expect(sent).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(sent).toMatchObject([{ ok: true, data: { name: 'Ada', country: 'CH', nights: 3 } }])
  })

  // A problem stops it as it would stop a send: the error is shown and nothing is reviewed. Next
  // checks every page it leaves, so the problem is on the page it is pressed on.
  test('shows the problem instead, when there is one', async () => {
    const required: FormSchema = {
      ...paged,
      model: {
        fields: [
          paged.model.fields[0]!,
          { key: 'stay', type: 'page', label: 'Your stay', fields: [{ key: 'nights', type: 'number', label: 'Nights', required: true }] },
        ],
      },
    }
    mount(required, { review: true }, { name: 'Ada' })
    await toLastPage()
    fireEvent.click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.queryByRole('heading', { name: 'Check your answers before you send them' })).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Nights' }).getAttribute('aria-invalid')).toBe('true')
  })

  // "Change" names its question for a screen reader, and lands on that question's control.
  test('returns to a question’s own page and control to change it', async () => {
    mount(paged, { review: true }, { name: 'Ada', country: 'CH', nights: 3 })
    await toLastPage()
    fireEvent.click(screen.getByRole('button', { name: 'Check your answers' }))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Change Country' })))
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Country' }))
  })

  // An optional question skipped by mistake is pointed out where the person checks, as its own
  // part a theme can mark, and its Change takes them back to answer it (0214).
  test('names a question left unanswered, and takes the person back to answer it', async () => {
    mount(paged, { review: true }, { name: 'Ada', nights: 3 })
    await toLastPage()
    fireEvent.click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Name', 'Country', 'Nights'])
    const unanswered = [...document.querySelectorAll('[data-formancy-part="review-unanswered"]')]
    expect(unanswered.map((said) => said.textContent)).toEqual(['Not answered'])
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Change Country' })))
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Country' }))
  })

  test('works on a form with no pages too', () => {
    const flat: FormSchema = { ...paged, model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] } }
    mount(flat, { review: true }, { name: 'Ada' })
    fireEvent.click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Name'])
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Change Name' })))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
  })

  test('is not offered unless the form asks for it', async () => {
    mount(paged, {}, { name: 'Ada' })
    await toLastPage()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check your answers' })).toBeNull()
  })
})
