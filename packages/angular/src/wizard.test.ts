import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { injectWizard, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const paged: FormSchema = {
  specVersion: '1',
  id: 'signup',
  title: 'Sign up',
  model: {
    fields: [
      {
        key: 'details',
        type: 'page',
        label: 'Details',
        fields: [{ key: 'email', type: 'text', label: 'Email', required: true }],
      },
      {
        key: 'review',
        type: 'page',
        label: 'Review',
        fields: [{ key: 'city', type: 'text', label: 'City' }],
      },
    ],
  },
}

const flat: FormSchema = {
  specVersion: '1',
  id: 'contact',
  title: 'Contact',
  model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
}

function setup(schema: FormSchema): FormEngine {
  const engine = createFormEngine({ schema })
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  return engine
}

describe('injectWizard', () => {
  test('page is a live signal; next validates the page it leaves, back never does', async () => {
    const engine = setup(paged)
    const wizard = TestBed.runInInjectionContext(() => injectWizard())

    expect(wizard.page()).toBe(0)
    expect(wizard.pageCount).toBe(2)

    // email is required, so the page must refuse to advance.
    expect(await wizard.next()).toBe(false)
    expect(wizard.page()).toBe(0)

    engine.setValue(['email'], 'ada@example.com')
    expect(await wizard.next()).toBe(true)
    expect(wizard.page()).toBe(1)

    wizard.back()
    expect(wizard.page()).toBe(0)
  })

  test('goTo jumps without validating — error navigation, never a gate', () => {
    setup(paged)
    const wizard = TestBed.runInInjectionContext(() => injectWizard())

    wizard.goTo(1)

    expect(wizard.page()).toBe(1)
  })

  test('throws usefully on an unpaged form', () => {
    setup(flat)
    expect(() => TestBed.runInInjectionContext(() => injectWizard())).toThrow(/pages/)
  })
})
