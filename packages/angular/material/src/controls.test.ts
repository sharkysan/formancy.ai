import { Component, provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyErrorSummary, FormancyForm, provideFormancy } from '../../src/index'
import { provideFormancyMaterial } from './index'

/**
 * What the shared fixtures do not reach (0132): the types no fixture uses, the variants
 * Material hands back to the default controls, and the places Material and the engine
 * both have an opinion — the error, the description, the required marker, the id a
 * summary links to.
 */
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const form = (fields: unknown[]): FormSchema =>
  ({ specVersion: '4', id: 'm', title: 'M', model: { fields } }) as unknown as FormSchema

async function mount(document: FormSchema): Promise<FormEngine> {
  const engine = createFormEngine({
    schema: document,
    capabilities: { now: () => 0, today: () => '2026-10-09', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...provideFormancyMaterial(),
    ],
    inputs: { submitLabel: 'Submit' },
  })
  await view.fixture.whenStable()
  return engine
}

describe('a field Material draws', () => {
  test.each([
    ['text', { key: 'a', type: 'text', label: 'A' }],
    ['textarea', { key: 'a', type: 'textarea', label: 'A' }],
    ['number', { key: 'a', type: 'number', label: 'A' }],
    ['date', { key: 'a', type: 'date', label: 'A' }],
    ['time', { key: 'a', type: 'time', label: 'A' }],
    ['select', { key: 'a', type: 'select', label: 'A', options: [{ value: 'x', label: 'X' }] }],
  ])('a %s is a control in Material’s form field, found by its name', async (_type, field) => {
    await mount(form([field]))

    const control = screen.getByLabelText('A')
    expect(control.closest('mat-form-field')).not.toBeNull()
  })

  test('a date is stored as the calendar day typed, and a time as HH:MM', async () => {
    const engine = await mount(
      form([
        { key: 'day', type: 'date', label: 'Day' },
        { key: 'at', type: 'time', label: 'At' },
      ]),
    )

    fireEvent.input(screen.getByLabelText('Day'), { target: { value: '2026-10-09' } })
    fireEvent.input(screen.getByLabelText('At'), { target: { value: '09:30' } })

    expect(engine.value()).toEqual({ day: '2026-10-09', at: '09:30' })
  })

  test('a checkbox, a radio group and a group of ticks are Material’s, and store what the defaults store', async () => {
    const engine = await mount(
      form([
        { key: 'ok', type: 'checkbox', label: 'Agree' },
        {
          key: 'size',
          type: 'radio',
          label: 'Size',
          options: [
            { value: 's', label: 'Small' },
            { value: 'l', label: 'Large' },
          ],
        },
        {
          key: 'extras',
          type: 'selectboxes',
          label: 'Extras',
          options: [
            { value: 'wrap', label: 'Wrap' },
            { value: 'card', label: 'Card' },
          ],
        },
      ]),
    )

    fireEvent.click(screen.getByLabelText('Agree'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Size' })).getByLabelText('Large'))
    const extras = screen.getByRole('group', { name: 'Extras' })
    // Ticked in the other order, stored in the options' order, as the default control does.
    fireEvent.click(within(extras).getByLabelText('Card'))
    fireEvent.click(within(extras).getByLabelText('Wrap'))

    expect(screen.getByLabelText('Agree').closest('mat-checkbox')).not.toBeNull()
    expect(screen.getByLabelText('Large').closest('mat-radio-group')).not.toBeNull()
    expect(engine.value()).toEqual({ ok: true, size: 'l', extras: ['wrap', 'card'] })
  })
})

describe('what Material cannot draw', () => {
  test.each([
    ['a mask', { key: 'a', type: 'text', label: 'A', mask: '999' }],
    ['a rating', { key: 'a', type: 'number', label: 'A', widget: 'rating', min: 1, max: 5 }],
    [
      'a typeahead',
      {
        key: 'a',
        type: 'select',
        label: 'A',
        widget: 'typeahead',
        options: [{ value: 'x', label: 'X' }],
      },
    ],
  ])('%s is drawn by the default control, not dropped', async (_what, field) => {
    await mount(form([field]))

    // The default control's markup: no Material form field anywhere on the page.
    expect(document.querySelector('mat-form-field')).toBeNull()
    expect(document.querySelector('[data-formancy-field-path="a"]')).not.toBeNull()
  })

  test('a picture on an option is drawn by the default radio group', async () => {
    await mount(
      form([
        {
          key: 'a',
          type: 'radio',
          label: 'A',
          options: [{ value: 'x', label: 'X', image: { src: '/x.png', alt: 'An x' } }],
        },
      ]),
    )

    expect(document.querySelector('mat-radio-group')).toBeNull()
    expect(document.querySelector('[data-formancy-part="option-image"]')).not.toBeNull()
  })
})

describe('where Material and the engine both have an opinion', () => {
  test('a required field shows Material’s marker, and its name is still the field’s name', async () => {
    // The marker is CSS on an empty aria-hidden element: nothing of it is text, so the
    // label and the accessible name are the field's name alone.
    await mount(form([{ key: 'email', type: 'text', label: 'Email', required: true }]))

    const control = screen.getByLabelText('Email')
    const marker = document.querySelector('.mat-mdc-form-field-required-marker')
    expect(marker?.getAttribute('aria-hidden')).toBe('true')
    expect(marker?.textContent).toBe('')
    expect(document.querySelector('label')?.textContent?.trim()).toBe('Email')
    expect(control.getAttribute('aria-required')).toBe('true')
  })

  test('an error is shown under the engine’s id, and read out once', async () => {
    const engine = await mount(
      form([{ key: 'email', type: 'text', label: 'Email', required: true }]),
    )
    const control = screen.getByLabelText('Email')

    // Submitted, which is when the engine says an empty required field is wrong — for
    // the default controls too; leaving it untouched-then-blurred says nothing yet.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(control.getAttribute('aria-describedby') ?? '').toContain('f:m:email:error'),
    )
    // Material adds the ids of the mat-error it shows; handed the engine's list whole,
    // the error would be described twice.
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/)
    expect(ids.filter((id) => id === 'f:m:email:error')).toHaveLength(1)
    expect(document.getElementById('f:m:email:error')?.textContent?.trim()).toBe('required')
    // Material's decision, not the engine's: an EMPTY required field is never marked
    // aria-invalid, so it is not announced as invalid before anything was typed. The
    // error is still its description. The default control marks it; this is the one
    // place the two differ, and it is said in 0132.
    expect(control.getAttribute('aria-invalid')).toBeNull()
    expect(engine.getFieldSnapshot(['email']).touched).toBe(true)
  })

  test('and a value that is wrong is marked invalid, as the engine says', async () => {
    await mount(form([{ key: 'code', type: 'text', label: 'Code', minLength: 5 }]))
    const control = screen.getByLabelText('Code')

    fireEvent.input(control, { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(control.getAttribute('aria-invalid')).toBe('true'))
  })

  test('the error summary’s link lands on Material’s checkbox', async () => {
    // The engine's control id is on mat-checkbox's host, which cannot take focus. The
    // summary is the host's to place, as it is for the default controls.
    @Component({
      selector: 'formancy-test-summary-host',
      imports: [FormancyErrorSummary, FormancyForm],
      template: `<formancy-error-summary /><formancy-form />`,
    })
    class SummaryHost {}
    const engine = createFormEngine({
      schema: form([{ key: 'ok', type: 'checkbox', label: 'Agree', required: true }]),
    })
    const view = await render(SummaryHost, {
      providers: [
        provideZonelessChangeDetection(),
        provideFormancy(engine),
        ...provideFormancyMaterial(),
      ],
    })
    await view.fixture.whenStable()

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    // The summary names a field by the host's labels, or its path: "ok: required".
    const link = await screen.findByRole('link', { name: /required/ })
    fireEvent.click(link)

    expect(document.activeElement).toBe(screen.getByLabelText('Agree'))
  })
})
