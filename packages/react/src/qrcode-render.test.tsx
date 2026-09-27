import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, FormancyProvider } from './index.js'

afterEach(cleanup)

/**
 * A `qrcode` node draws an actual code.
 *
 * ── A REVERSAL, AND WHY ─────────────────────────────────────────────────────
 *
 * [0070](../../../docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md) shipped this
 * node showing the value as text and no picture, on the grounds that an encoder is a
 * dependency for something a design system may want to draw its own way. That reasoning was
 * about cost, and it was answered: a visible code is the feature. `uqr` is MIT, has **no
 * dependencies**, and is one SOUP row.
 *
 * ── THE SVG IS BUILT HERE RATHER THAN BY THE LIBRARY ────────────────────────
 *
 * `uqr.renderSVG` exists and is not used: it emits `fill="white"` and `fill="black"`, which
 * takes appearance away from the consumer's design system — the one thing this project
 * exists to avoid. `encode` returns a boolean matrix instead, and the rects are drawn with
 * `fill="currentColor"` so a theme decides the colour by setting `color`, and the light
 * modules are simply absent so whatever is behind shows through.
 *
 * ── AND THE PICTURE IS NOT THE CONTENT ──────────────────────────────────────
 *
 * Unchanged from 0070, and the reason the value stays on the page: a picture of a code says
 * nothing to a screen reader, and an `alt` of "QR code" says nothing either. So the SVG is
 * `aria-hidden` and the value remains real text — somebody who cannot see the code can still
 * read, copy or dictate it, and somebody who can has both.
 */
const schema = {
  specVersion: '2',
  id: 'pass',
  title: 'Pass',
  model: { fields: [{ key: 'reference', type: 'text', label: 'Booking reference' }] },
  layouts: [
    {
      name: 'web',
      nodes: [
        { kind: 'field', path: 'reference' },
        { kind: 'qrcode', path: 'reference', label: 'Your pass' },
      ],
    },
  ],
} as FormSchema

function mount() {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-27', random: () => 0.5 },
  })
  render(
    <FormancyProvider engine={engine}>
      <FormancyForm layout="web" />
    </FormancyProvider>,
  )
  return engine
}

const svg = (): SVGElement | null => document.querySelector('[data-formancy-part="code"] svg')

describe('a code node with an answer', () => {
  test('draws a code', () => {
    const engine = mount()
    act(() => {
      engine.setValue(['reference'], 'AB-1234')
    })
    const drawn = svg()
    expect(drawn).not.toBeNull()
    // More than one module, or it is not a code. A real encoding of this value is a 23×23
    // matrix, so the count is well into the hundreds -- asserted as a floor rather than an
    // exact number, because the count depends on the value and the mask pattern.
    expect(drawn!.querySelectorAll('rect').length).toBeGreaterThan(50)
  })

  test('draws nothing at all when there is no answer yet', () => {
    // An empty string encodes to a valid code, which would be a scannable picture of
    // nothing -- worse than no picture, because somebody would scan it.
    mount()
    expect(svg()).toBeNull()
  })

  test('takes its colour from the theme rather than choosing one', () => {
    // `currentColor` and no background. The library's own renderer emits fill="white" and
    // fill="black", which is a renderer shipping appearance -- the thing decision 0004
    // exists to prevent.
    const engine = mount()
    act(() => {
      engine.setValue(['reference'], 'AB-1234')
    })
    const fills = new Set(
      [...svg()!.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill')),
    )
    expect([...fills]).toEqual(['currentColor'])
    expect(svg()!.innerHTML).not.toMatch(/white|#fff/i)
  })

  test('hides the picture from assistive technology and keeps the value as text', () => {
    // The picture is decoration; the value is the content. A screen reader gets something
    // it can read out, and nobody gets "QR code" as though that were useful.
    const engine = mount()
    act(() => {
      engine.setValue(['reference'], 'AB-1234')
    })
    expect(svg()!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('AB-1234')).toBeDefined()
  })

  test('redraws when the answer changes', () => {
    // The bug written twice already in this repository: a component that reads the snapshot
    // without subscribing renders once and never again.
    const engine = mount()
    act(() => {
      engine.setValue(['reference'], 'AB-1234')
    })
    const first = svg()!.innerHTML
    act(() => {
      engine.setValue(['reference'], 'ZZ-9999')
    })
    expect(svg()!.innerHTML).not.toBe(first)
  })
})
