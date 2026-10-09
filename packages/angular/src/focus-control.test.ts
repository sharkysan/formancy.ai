import { afterEach, describe, expect, test } from 'vitest'
import { focusControl } from './focus-control.js'

/**
 * Where an error summary's link puts focus (0132).
 *
 * The engine's control id names the element to focus. A design system's control may put
 * that id on its host and the input inside — Material's checkbox does — and focusing a
 * host that cannot take focus does nothing at all: the link scrolls and the keyboard stays
 * where it was. The same function in both renderers, so a custom control behaves the same
 * under either.
 */
afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusControl', () => {
  test('focuses the control the id names', () => {
    document.body.innerHTML = '<input id="f:c:email:control" />'
    const input = document.getElementById('f:c:email:control')

    focusControl(input)

    expect(document.activeElement).toBe(input)
  })

  test('and when the id names a host that cannot take focus, the control inside it', () => {
    document.body.innerHTML =
      '<mat-checkbox id="f:c:terms:control"><label for="inner">Terms</label><input id="inner" type="checkbox" /></mat-checkbox>'

    focusControl(document.getElementById('f:c:terms:control'))

    expect(document.activeElement).toBe(document.getElementById('inner'))
  })

  test('and nothing at all for an id nothing has', () => {
    expect(() => focusControl(null)).not.toThrow()
  })
})
