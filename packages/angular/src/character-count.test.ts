import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

/** The React binding's `character-count.test.tsx`, case for case (0203). */
async function mount(field: FieldDef) {
  const schema: FormSchema = { specVersion: '5', id: 'f', title: 'F', model: { fields: [field] } }
  const view = await render(FormancyForm, { providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema }))] })
  await view.fixture.whenStable()
  return {
    type: async (box: HTMLElement, value: string): Promise<void> => {
      fireEvent.input(box, { target: { value } })
      await view.fixture.whenStable()
    },
    settle: async (): Promise<void> => void (await view.fixture.whenStable()),
  }
}

const note: FieldDef = { key: 'note', type: 'textarea', label: 'Note', maxLength: 10 }

describe('a character count', () => {
  test('says the limit under an empty box, and describes the box', async () => {
    await mount(note)
    const count = screen.getByText('You can enter up to 10 characters.')
    expect(screen.getByRole('textbox', { name: 'Note' }).getAttribute('aria-describedby')).toBe(count.id)
  })

  test('says what is left as soon as somebody types, and how many too many past the limit', async () => {
    const { type } = await mount({ ...note, type: 'text' })
    const box = screen.getByRole('textbox', { name: 'Note' })
    await type(box, 'Hello')
    expect(screen.getByText('You have 5 characters remaining.')).toBeTruthy()
    await type(box, 'Hello world')
    expect(screen.getByText('You have 1 character too many.')).toBeTruthy()
  })

  test('is spoken once typing pauses, and not before', async () => {
    // Advancing with real time too, or Angular's zoneless scheduler — itself a timeout — never
    // runs and the fixture never settles.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { type, settle } = await mount(note)
    const status = screen.getByRole('status')
    vi.advanceTimersByTime(2000)
    await settle()
    expect(status.textContent?.trim()).toBe('')

    await type(screen.getByRole('textbox', { name: 'Note' }), 'Hi')
    expect(status.textContent?.trim()).toBe('')
    vi.advanceTimersByTime(1000)
    await settle()
    expect(status.textContent?.trim()).toBe('You have 8 characters remaining.')
  })

  test('is not there for a box with no limit', async () => {
    await mount({ key: 'plain', type: 'textarea', label: 'Plain' })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Plain' }).getAttribute('aria-describedby')).toBeNull()
  })
})
