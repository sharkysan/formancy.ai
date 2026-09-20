import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { injectRepeater, provideFormancy } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest
// only provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

const schema: FormSchema = {
  specVersion: '1',
  id: 'team',
  title: 'Team',
  model: {
    fields: [
      {
        key: 'contacts',
        type: 'repeater',
        label: 'Contacts',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
    ],
  },
}

function setup(): FormEngine {
  const engine = createFormEngine({ schema })
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  return engine
}

describe('injectRepeater', () => {
  test('rowCount is a live signal over the engine rows', () => {
    setup()
    const repeater = TestBed.runInInjectionContext(() => injectRepeater('contacts'))

    expect(repeater.rowCount()).toBe(0)
    repeater.addRow()
    expect(repeater.rowCount()).toBe(1)
    repeater.addRow()
    expect(repeater.rowCount()).toBe(2)
    repeater.removeRow(0)
    expect(repeater.rowCount()).toBe(1)
  })

  test('an engine mutation from outside Angular reaches the signal', () => {
    const engine = setup()
    const repeater = TestBed.runInInjectionContext(() => injectRepeater('contacts'))

    engine.addRow(['contacts'])

    expect(repeater.rowCount()).toBe(1)
  })

  test('a non-repeater path fails loudly', () => {
    setup()
    expect(() => TestBed.runInInjectionContext(() => injectRepeater('name'))).toThrow(/repeater/)
  })
})
