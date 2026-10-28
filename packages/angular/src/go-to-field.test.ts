import { Component, input, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, injectGoToField, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest only provides with
// globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * A host taking a person to a question, as the error summary's links and the review's Change do
 * (0213): the cases `packages/react/src/go-to-field.test.tsx` holds React's to, by the same names.
 */
@Component({
  selector: 'formancy-test-go-to',
  imports: [FormancyForm],
  template: `
    <button type="button" (click)="goToField(path())">Go to {{ path() }}</button>
    <formancy-form />
  `,
})
class GoToHost {
  readonly path = input.required<string>()
  protected readonly goToField = injectGoToField()
}

const options = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

async function mount(schema: FormSchema, path: string) {
  const engine = createFormEngine({ schema })
  const view = await render(GoToHost, {
    inputs: { path },
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  const go = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: `Go to ${path}` }))
    await view.fixture.whenStable()
  }
  return { engine, go, view }
}

describe('a host taking a person to a question', () => {
  test('on another page, moves the form to that page and focuses the question', async () => {
    const { engine, go } = await mount(
      {
        specVersion: '4',
        id: 'trip',
        title: 'Trip',
        model: {
          fields: [
            { key: 'one', type: 'page', label: 'One', fields: [{ key: 'name', type: 'text', label: 'Name' }] },
            { key: 'two', type: 'page', label: 'Two', fields: [{ key: 'city', type: 'text', label: 'City' }] },
          ],
        },
      } as unknown as FormSchema,
      'city',
    )
    expect(screen.queryByRole('textbox', { name: 'City' })).toBeNull()

    await go()

    expect(engine.wizard()?.page()).toBe(1)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'City' }))
  })

  test('to a radio group, focuses its first option, since a fieldset takes no focus', async () => {
    const { go } = await mount(
      {
        specVersion: '4',
        id: 'visit',
        title: 'Visit',
        model: { fields: [{ key: 'smoker', type: 'radio', label: 'Smoker', options }] },
      } as unknown as FormSchema,
      'smoker',
    )

    await go()

    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Yes' }))
  })

  test('to a field in a row, focuses that row’s', async () => {
    const { engine, go, view } = await mount(
      {
        specVersion: '4',
        id: 'guests',
        title: 'Guests',
        model: {
          fields: [{ key: 'guests', type: 'repeater', label: 'Guests', fields: [{ key: 'name', type: 'text', label: 'Name' }] }],
        },
      } as unknown as FormSchema,
      'guests[1].name',
    )
    engine.addRow(['guests'])
    engine.addRow(['guests'])
    await view.fixture.whenStable()

    await go()

    expect(document.activeElement?.id).toBe(engine.getFieldSnapshot(['guests', 1, 'name']).ids.control)
  })
})

test('a path no field has is refused, as the engine refuses it, not ignored', () => {
  // As React's: a host's link that goes nowhere is a bug to find, not a click to ignore.
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(
        createFormEngine({
          schema: { specVersion: '4', id: 'one', title: 'One', model: { fields: [{ key: 'name', type: 'text', label: 'Name' }] } } as unknown as FormSchema,
        }),
      ),
    ],
  })
  const goToField = TestBed.runInInjectionContext(() => injectGoToField())

  expect(() => goToField('nope')).toThrow(/Unknown field "nope"/)
})
