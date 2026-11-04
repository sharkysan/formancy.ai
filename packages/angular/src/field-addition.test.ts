import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, viewChild } from '@angular/core'
import type { TemplateRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'
import type { FormancyFieldAddition, FormancyFieldAdditionContext } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/** The React binding's `field-addition.test.tsx`, case for case (0233). */
const form: FormSchema = {
  specVersion: '5',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text', label: 'Customer', description: 'Who it is for.', required: true },
      { key: 'size', type: 'radio', label: 'Size', options: [{ value: 's', label: 'Small' }] },
      { key: 'extras', type: 'selectboxes', label: 'Extras', options: [{ value: 'cheese', label: 'Cheese' }] },
      {
        key: 'rating',
        type: 'matrix',
        label: 'Rating',
        rows: [{ value: 'taste', label: 'Taste' }],
        options: [{ value: 'great', label: 'Great' }],
      },
      {
        key: 'order',
        type: 'ranking',
        label: 'Order',
        options: [
          { value: 'tea', label: 'Tea' },
          { value: 'coffee', label: 'Coffee' },
        ],
      },
      { key: 'secret', type: 'text', label: 'Secret' },
      { key: 'lines', type: 'repeater', label: 'Lines', minItems: 1, fields: [{ key: 'item', type: 'text', label: 'Item' }] },
    ],
  },
  logic: { rules: [{ target: 'secret', kind: 'visible', cel: 'false' }] },
}

const CLOCK = { now: () => 0, today: () => '2026-11-04', random: () => 0.5 }

/** Which paths the host gives content for, and every path it was asked about. */
let wanted: (path: string) => boolean = () => false
let asked: string[] = []

@Component({
  imports: [FormancyForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <formancy-form [fieldAddition]="addition" />
    <ng-template #summary let-path let-field="field">
      <a href="#record">About {{ path }}</a> <span>Chosen: {{ field.snapshot().value ?? 'nothing' }}</span> <button type="button">Open</button>
    </ng-template>
  `,
})
class Host {
  private readonly summary = viewChild<TemplateRef<FormancyFieldAdditionContext>>('summary')
  protected readonly addition: FormancyFieldAddition = (path) => {
    asked.push(path)
    return wanted(path) ? this.summary() : undefined
  }
}

async function mount(only: (path: string) => boolean, schema: FormSchema = form, initialValue?: Record<string, unknown>): Promise<void> {
  wanted = only
  asked = []
  const view = await render(Host, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(createFormEngine({ schema, capabilities: CLOCK, ...(initialValue === undefined ? {} : { initialValue }) })),
    ],
  })
  await view.fixture.whenStable()
}

/** The form alone, with no addition given: what a form drawn today looks like. */
async function mountPlain(schema: FormSchema = form): Promise<void> {
  const view = await render(FormancyForm, {
    providers: [provideZonelessChangeDetection(), provideFormancy(createFormEngine({ schema, capabilities: CLOCK }))],
  })
  await view.fixture.whenStable()
}

const wrapperOf = (path: string) => document.querySelector(`[data-formancy-part="field"][data-formancy-field-path="${path}"]`)
const additions = () => [...document.querySelectorAll('[data-formancy-part="field-addition"]')]
/** Every field's elements and attributes, without the comments Angular anchors its blocks with. */
const markup = () =>
  [...document.querySelectorAll('[data-formancy-part="field"]')].map((field) =>
    field.outerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/ _ng[a-z]+-[a-z0-9-]+=""/g, ''),
  )

describe('a field addition', () => {
  test('draws nothing where the host gives nothing, so the form is unchanged', async () => {
    await mountPlain()
    const without = markup()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount(() => false)

    expect(additions()).toEqual([])
    expect(without.length).toBeGreaterThan(5)
    expect(markup()).toEqual(without)
  })

  test('is drawn in the field’s own wrapper, after its label, description, control and error', async () => {
    await mount((path) => path === 'customer')
    screen.getByRole('button', { name: /submit/i }).click()
    await waitFor(() => expect(wrapperOf('customer')?.querySelector('[data-formancy-part="error"]')).not.toBeNull())

    const wrapper = wrapperOf('customer')
    const parts = [...(wrapper?.children ?? [])].map((child) => child.getAttribute('data-formancy-part') ?? child.tagName.toLowerCase())

    expect(parts.at(-1)).toBe('field-addition')
    expect(parts).toContain('error')
    expect(additions()).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'About customer' }).closest('[data-formancy-part="field-addition"]')?.parentElement).toBe(wrapper)
  })

  test.each(['size', 'extras', 'rating', 'order'])('in the fieldset that draws %s too', async (path) => {
    await mount((asked) => asked === path)

    expect(screen.getByText(`About ${path}`).closest('[data-formancy-part="field-addition"]')?.parentElement).toBe(wrapperOf(path))
  })

  test('is asked for by each field’s own path, a row’s field and no hidden one among them', async () => {
    await mount(() => false)

    const drawn = [...document.querySelectorAll('[data-formancy-part="field"]')].map((field) => field.getAttribute('data-formancy-field-path'))
    expect(new Set(asked)).toEqual(new Set(drawn))
    expect(asked).not.toContain('secret')
    expect(drawn.some((path) => path?.startsWith('lines') === true && path !== 'lines')).toBe(true)
  })

  // Angular's counterpart of React's `useField(path)`: the template is given the field's binding.
  test('reads the field’s value through the binding its template is given', async () => {
    const schema: FormSchema = { ...form, model: { fields: [{ key: 'customer', type: 'text', label: 'Customer' }] }, logic: { rules: [] } }

    await mount((path) => path === 'customer', schema, { customer: 'C-17' })

    expect(screen.getByText('Chosen: C-17')).toBeTruthy()
  })

  test('adds no role or name, and describes no control', async () => {
    const describedBy = () => screen.getByRole('textbox', { name: 'Customer' }).getAttribute('aria-describedby')
    await mountPlain()
    const without = describedBy()
    TestBed.resetTestingModule()
    document.body.innerHTML = ''

    await mount((path) => path === 'customer')

    const addition = additions()[0]
    expect(addition?.getAttribute('role')).toBeNull()
    expect(addition?.getAttribute('aria-label')).toBeNull()
    expect(describedBy()).toBe(without)
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })
})
