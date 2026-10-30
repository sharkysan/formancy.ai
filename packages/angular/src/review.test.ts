import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'
import type { SubmitOutcome } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `review.test.tsx`, case for case (0204). */
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

async function mount(schema: FormSchema, review: boolean, initialValue: Record<string, unknown>) {
  const sent: SubmitOutcome[] = []
  const engine = createFormEngine({ schema, initialValue })
  const view = await render(FormancyForm, {
    componentInputs: { review },
    on: { submitted: (outcome: SubmitOutcome) => sent.push(outcome) },
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  const click = async (element: HTMLElement): Promise<void> => {
    fireEvent.click(element)
    await view.fixture.whenStable()
  }
  const toLastPage = async (): Promise<void> => {
    await click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('spinbutton', { name: 'Nights' })
  }
  return { sent, click, toLastPage }
}

describe('checking the answers', () => {
  test('is offered on the last step in place of sending, and shows every answer in words', async () => {
    const { sent, click, toLastPage } = await mount(paged, true, { name: 'Ada', country: 'CH', nights: 3 })
    await toLastPage()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    await click(screen.getByRole('button', { name: 'Check your answers' }))

    const heading = screen.getByRole('heading', { name: 'Check your answers before you send them' })
    expect(document.activeElement).toBe(heading)
    expect(screen.getAllByRole('term').map((term) => term.textContent?.trim())).toEqual(['Name', 'Country', 'Nights'])
    expect(
      screen
        .getAllByRole('definition')
        .map((definition) => definition.textContent?.trim())
        .filter((said) => !said?.startsWith('Change')),
    ).toEqual(['Ada', 'Switzerland', '3'])
    expect(sent).toEqual([])

    await click(screen.getByRole('button', { name: 'Submit' }))
    expect(sent).toMatchObject([{ ok: true, data: { name: 'Ada', country: 'CH', nights: 3 } }])
  })

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
    const { click, toLastPage } = await mount(required, true, { name: 'Ada' })
    await toLastPage()
    await click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.queryByRole('heading', { name: 'Check your answers before you send them' })).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Nights' }).getAttribute('aria-invalid')).toBe('true')
  })

  test('returns to a question’s own page and control to change it', async () => {
    const { click, toLastPage } = await mount(paged, true, { name: 'Ada', country: 'CH', nights: 3 })
    await toLastPage()
    await click(screen.getByRole('button', { name: 'Check your answers' }))
    await click(screen.getByRole('button', { name: 'Change Country' }))
    const country = await screen.findByRole('combobox', { name: 'Country' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.activeElement).toBe(country)
  })

  // The React binding's case: a question skipped by mistake is pointed out as its own part, and
  // its Change takes the person back to answer it (0214).
  test('names a question left unanswered, and takes the person back to answer it', async () => {
    const { click, toLastPage } = await mount(paged, true, { name: 'Ada', nights: 3 })
    await toLastPage()
    await click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Name', 'Country', 'Nights'])
    const unanswered = [...document.querySelectorAll('[data-formancy-part="review-unanswered"]')]
    expect(unanswered.map((said) => said.textContent)).toEqual(['Not answered'])
    await click(screen.getByRole('button', { name: 'Change Country' }))
    const country = await screen.findByRole('combobox', { name: 'Country' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.activeElement).toBe(country)
  })

  test('works on a form with no pages too', async () => {
    const flat: FormSchema = { ...paged, model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] } }
    const { click } = await mount(flat, true, { name: 'Ada' })
    await click(screen.getByRole('button', { name: 'Check your answers' }))
    expect(screen.getAllByRole('term').map((term) => term.textContent?.trim())).toEqual(['Name'])
    await click(screen.getByRole('button', { name: 'Change Name' }))
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.activeElement).toBe(name)
  })

  test('is not offered unless the form asks for it', async () => {
    const { toLastPage } = await mount(paged, false, { name: 'Ada' })
    await toLastPage()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check your answers' })).toBeNull()
  })
})
