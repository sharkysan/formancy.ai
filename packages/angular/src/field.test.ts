import { Component, provideZonelessChangeDetection } from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { injectField, provideFormancy } from './index'

const schema: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', required: true },
      { key: 'message', type: 'text' },
    ],
  },
}

@Component({
  selector: 'formancy-test-email',
  template: `
    <label [attr.for]="field.snapshot().ids.control">Email</label>
    <input
      [id]="field.snapshot().ids.control"
      [attr.name]="field.snapshot().props.control.name"
      [value]="asText(field.snapshot().value)"
      [attr.aria-invalid]="field.snapshot().props.control['aria-invalid']"
      (input)="onInput($event)"
      (blur)="field.touch()"
    />
  `,
})
class EmailField {
  readonly field = injectField('email')

  asText(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  onInput(event: Event): void {
    this.field.setValue((event.target as HTMLInputElement).value)
  }
}

function renderField(engine = createFormEngine({ schema })) {
  return render(EmailField, {
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  }).then((view) => ({ view, engine }))
}

describe('injectField', () => {
  test('renders the engine value through a signal', async () => {
    await renderField(createFormEngine({ schema, initialValue: { email: 'a@b.ch' } }))

    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'a@b.ch')
  })

  test('typing lands in the engine', async () => {
    const { engine } = await renderField()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'x@y.ch' } })

    expect(engine.getFieldSnapshot(['email']).value).toBe('x@y.ch')
  })

  test('an engine mutation from outside Angular reaches the DOM — the zoneless proof', async () => {
    const { view, engine } = await renderField()

    engine.setValue(['email'], 'prefilled@b.ch')
    await view.fixture.whenStable()

    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'prefilled@b.ch')
  })

  test('validation state flows into ARIA exactly as in React — same engine, same props', async () => {
    const { view, engine } = await renderField()

    engine.validate()
    engine.touch(['email'])
    await view.fixture.whenStable()

    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
  })

  test('a component outside provideFormancy fails loudly', async () => {
    await expect(
      render(EmailField, { providers: [provideZonelessChangeDetection()] }),
    ).rejects.toThrow(/provideFormancy/)
  })
})
