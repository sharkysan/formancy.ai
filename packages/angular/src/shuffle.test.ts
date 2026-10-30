import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FieldDef, FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `shuffle.test.tsx`, case for case (0200). */
const options = [
  { value: 'friend', label: 'A friend' },
  { value: 'press', label: 'The press' },
  { value: 'search', label: 'A search' },
  { value: 'none', label: 'None of these', keepPlace: true },
]

const ZERO = { now: () => 0, today: () => '2026-10-27', random: () => 0 }

async function mount(type: 'radio' | 'selectboxes') {
  const field = { key: 'channel', type, label: 'How did you hear of us?', shuffle: true, options } as FieldDef
  const schema: FormSchema = { specVersion: '5', id: 'survey', title: 'Survey', model: { fields: [field] } }
  const engine = createFormEngine({ schema, capabilities: ZERO })
  const view = await render(FormancyForm, { providers: [provideZonelessChangeDetection(), provideFormancy(engine)] })
  await view.fixture.whenStable()
  const click = async (element: HTMLElement): Promise<void> => {
    fireEvent.click(element)
    await view.fixture.whenStable()
  }
  return { engine, click }
}

const named = (role: 'radio' | 'checkbox'): string[] => screen.getAllByRole(role).map((control) => (control as HTMLInputElement).id.split(':').pop() ?? '')

describe('a shuffled order', () => {
  test('draws a radio group’s options in the engine’s order, with the one that keeps its place last', async () => {
    await mount('radio')
    expect(named('radio')).toEqual(['press', 'search', 'friend', 'none'])
  })

  test('draws a list of ticks the same way, and stores what is ticked in the written order', async () => {
    const { engine, click } = await mount('selectboxes')
    expect(named('checkbox')).toEqual(['press', 'search', 'friend', 'none'])
    await click(screen.getByRole('checkbox', { name: 'The press' }))
    await click(screen.getByRole('checkbox', { name: 'A friend' }))
    expect(engine.getFieldSnapshot(['channel']).value).toEqual(['friend', 'press'])
  })
})
