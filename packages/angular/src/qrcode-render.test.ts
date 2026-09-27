import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy } from './index'

afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * A `qrcode` node draws an actual code — the same assertions React makes.
 *
 * Deliberately a near-copy rather than a shared helper: a renderer's markup is the thing
 * that must not be shared, and a shared abstraction would report that both drew a code when
 * one had not.
 *
 * The picture is decoration and the value is the content, unchanged from
 * [0070](../../../docs/decisions/0070-a-code-is-an-arrangement-not-a-field.md): a picture of
 * a code says nothing to a screen reader, and an `alt` of "QR code" says nothing either.
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

async function mount() {
  const engine = createFormEngine({
    schema,
    capabilities: { now: () => 0, today: () => '2026-09-27', random: () => 0.5 },
  })
  const view = await render(FormancyForm, {
    componentInputs: { layout: 'web' },
    providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
  })
  await view.fixture.whenStable()
  return { engine, view }
}

const svg = (): SVGElement | null => document.querySelector('[data-formancy-part="code"] svg')

describe('a code node with an answer', () => {
  test('draws a code', async () => {
    const { engine, view } = await mount()
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    expect(svg()).not.toBeNull()
    expect(svg()!.querySelectorAll('rect').length).toBeGreaterThan(50)
  })

  test('draws nothing at all when there is no answer yet', async () => {
    // An empty string encodes to a valid code, and a scannable picture of nothing is worse
    // than no picture, because somebody would scan it.
    await mount()
    expect(svg()).toBeNull()
  })

  test('takes its colour from the theme rather than choosing one', async () => {
    const { engine, view } = await mount()
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    const fills = new Set(
      [...svg()!.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill')),
    )
    expect([...fills]).toEqual(['currentColor'])
    expect(svg()!.innerHTML).not.toMatch(/white|#fff/i)
  })

  test('hides the picture from assistive technology and keeps the value as text', async () => {
    const { engine, view } = await mount()
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    expect(svg()!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('AB-1234')).toBeDefined()
  })

  test('redraws when the answer changes', async () => {
    // The bug written twice in this repository: a component that reads the snapshot without
    // subscribing renders once and never again.
    const { engine, view } = await mount()
    engine.setValue(['reference'], 'AB-1234')
    await view.fixture.whenStable()
    const first = svg()!.querySelectorAll('rect').length
    engine.setValue(['reference'], 'a much longer reference that needs a bigger code')
    await view.fixture.whenStable()
    expect(svg()!.querySelectorAll('rect').length).not.toBe(first)
  })
})
