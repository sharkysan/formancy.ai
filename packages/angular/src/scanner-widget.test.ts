import { provideZonelessChangeDetection } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, describe, expect, test } from 'vitest'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { FormancyForm, provideFormancy, provideFormancyScanner } from './index'
import type { Scanner } from './index'

// Testing-library's auto-cleanup hooks into a global afterEach, which vitest only
// provides with globals: true; we keep globals off, so reset explicitly.
afterEach(() => {
  TestBed.resetTestingModule()
  document.body.innerHTML = ''
})

/**
 * `widget: "scanner"` in Angular — the same assertions React makes.
 *
 * Deliberately a near-copy rather than a shared helper. Two renderers agreeing is
 * the claim this repository is built on, and the way it stops being true is one of
 * them quietly not implementing something while a shared abstraction reports that
 * both did. `@formancy/conformance` is where behaviour is specified once and run
 * against both drivers; this is a unit test of a renderer's own markup, and a
 * renderer's markup is exactly the thing that must not be shared.
 *
 * The design is argued in the React file and is the same here
 * ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)): the
 * host supplies the camera, no scanner means no button and a plain text input, the
 * button's name carries the field's label, a device failure goes to a `role="status"`
 * region rather than the error region, and what the camera read is stored and then
 * judged by the engine like any typed value.
 */
const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

function schema(widget?: 'scanner'): FormSchema {
  return {
    specVersion: '2',
    id: 'scanning',
    title: 'Scanning',
    model: {
      fields: [
        {
          key: 'serial',
          type: 'text',
          label: 'Serial number',
          pattern: '[A-Z0-9]{6}',
          ...(widget === undefined ? {} : { widget }),
        },
        {
          key: 'voucher',
          type: 'text',
          label: 'Voucher code',
          ...(widget === undefined ? {} : { widget }),
        },
      ],
    },
  } as FormSchema
}

async function mount(
  scan?: Scanner,
  widget: 'scanner' | undefined = 'scanner',
): Promise<{ engine: FormEngine; settle: () => Promise<void> }> {
  const engine = createFormEngine({ schema: schema(widget), capabilities: CLOCK })
  const view = await render(FormancyForm, {
    providers: [
      provideZonelessChangeDetection(),
      provideFormancy(engine),
      ...(scan === undefined ? [] : [provideFormancyScanner(scan)]),
    ],
  })
  await view.fixture.whenStable()
  return { engine, settle: () => view.fixture.whenStable() }
}

const statusOf = (label: string): string =>
  screen.getByRole('textbox', { name: label }).closest('[data-formancy-part="field"]')!
    .querySelector('[data-formancy-part="scanner-status"]')?.textContent ?? ''

const errorOf = (label: string): string | null =>
  screen.getByRole('textbox', { name: label }).closest('[data-formancy-part="field"]')!
    .querySelector('[data-formancy-part="error"]')?.textContent ?? null

describe('a text field with the scanner widget', () => {
  test('is a text box with the same name, whether a scanner is there or not', async () => {
    // The conformance floor: every fixture finds a text field by role `textbox` and
    // its accessible name ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
    await mount(async () => 'ABC123')
    expect(screen.getByRole('textbox', { name: 'Serial number' }).getAttribute('type')).toBe('text')

    TestBed.resetTestingModule()
    document.body.innerHTML = ''
    await mount(undefined, undefined)
    expect(screen.getByRole('textbox', { name: 'Serial number' }).getAttribute('type')).toBe('text')
  })

  test('offers no scan button when no scanner was supplied, and still takes typing', async () => {
    // The failure this prevents: a button that opens nothing. A host with no camera
    // route is the ordinary case, not a mistake.
    const { engine, settle } = await mount(undefined)

    expect(screen.queryByRole('button', { name: /^Scan/ })).toBeNull()

    const input = screen.getByRole('textbox', { name: 'Serial number' })
    fireEvent.input(input, { target: { value: 'ABC123' } })
    await settle()
    expect(engine.value()).toEqual({ serial: 'ABC123' })
  })

  test('names each scan button after its own field', async () => {
    // The failure this prevents: two buttons called "Scan" on one page. The visible
    // word stays "Scan" and the label completes the accessible name, so the name
    // still contains the visible text (WCAG 2.5.3) and the two fields can be told
    // apart by name alone — which is all a conformance driver may use.
    await mount(async () => 'ABC123')

    expect(screen.getByRole('button', { name: 'Scan Serial number' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Scan Voucher code' })).toBeDefined()
  })

  test('stores exactly the string the scanner returned, as typing would', async () => {
    // The line a widget may not cross: how a field looks, never what it collects
    // ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
    const { engine } = await mount(async () => 'ABC123')

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(engine.value()).toEqual({ serial: 'ABC123' })
    })
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Serial number' })).toHaveProperty(
        'value',
        'ABC123',
      )
    })
  })

  test('stores a multi-line payload the way the input would', async () => {
    // Same reasoning as the React file: CR and LF cannot be typed into a text input because
    // the platform strips them, so a scanned payload keeping them would be an answer the
    // default control cannot produce -- the one thing a widget may never do.
    const { engine, settle } = await mount(async () => 'WIFI:S:home;\r\nP:secret;;')

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))
    await settle()

    expect(engine.value()).toEqual({ serial: 'WIFI:S:home;P:secret;;' })
  })

  test('tells the scanner which field it is scanning for', async () => {
    // So a host's camera sheet can say what it is looking for; "Scan" over a
    // viewfinder on a form with three scannable fields says nothing.
    const asked: Array<{ label: string; path: string }> = []
    await mount(async (request) => {
      asked.push({ label: request.label, path: request.path })
      return null
    })

    fireEvent.click(screen.getByRole('button', { name: 'Scan Voucher code' }))

    await waitFor(() => {
      expect(asked).toEqual([{ label: 'Voucher code', path: 'voucher' }])
    })
  })

  test('stores a scan the pattern refuses, and lets the engine judge it', async () => {
    // The failure this prevents: a renderer second-guessing the engine. Errors track
    // edits only after the first validation, so a scanned value that is wrong is no
    // louder and no quieter than a typed one — which is why Submit is part of the
    // case rather than a detail of it.
    const { engine } = await mount(async () => 'not-a-serial')

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))
    await waitFor(() => {
      expect(engine.value()).toEqual({ serial: 'not-a-serial' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(errorOf('Serial number')).toBe('pattern')
    })
    // Still there afterwards: refusing it is the engine's answer, not a reason to
    // forget what the camera read.
    expect(engine.value()).toEqual({ serial: 'not-a-serial' })
  })

  test('puts a refused camera in the status region and never in the error region', async () => {
    // The failure this prevents: a hardware problem that reads as a wrong answer. The
    // error region is the control's describedby target and holds the engine's
    // verdicts; a renderer writing a device message into it would be lying about the
    // engine's state.
    const { engine, settle } = await mount(async () => {
      throw new Error('Camera permission was refused')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(statusOf('Serial number')).toContain('Camera permission was refused')
    })
    expect(statusOf('Serial number')).toContain('Type the value instead')
    expect(errorOf('Serial number')).toBeNull()

    // And the field is still fillable, which is the whole reason the fallback is the
    // default control rather than a read-only box.
    fireEvent.input(screen.getByRole('textbox', { name: 'Serial number' }), {
      target: { value: 'ABC123' },
    })
    await settle()
    expect(engine.value()).toEqual({ serial: 'ABC123' })
  })

  test('says nothing when somebody closes the camera without scanning', async () => {
    // A cancel is not a failure, and an apology in a live region for a decision
    // somebody made on purpose is noise. `null` is the cancel, a rejection is the
    // failure, and the two are deliberately different answers.
    const { engine, settle } = await mount(async () => null)

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))
    await settle()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Scan Serial number' })).toHaveProperty(
        'disabled',
        false,
      )
    })
    expect(statusOf('Serial number')).toBe('')
    expect(engine.value()).toEqual({})
  })

  test('refuses to store anything that is not text', async () => {
    // The structural half of "a widget never changes what a field collects": the one
    // call to setValue in this control takes a string, so a host written in plain
    // JavaScript that resolves with `{ text: 'ABC123' }` cannot put an object into a
    // text field. It is reported as a device failure, which is what it is.
    const { engine } = await mount((async () => ({ text: 'ABC123' })) as unknown as Scanner)

    fireEvent.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(statusOf('Serial number')).toContain('did not return text')
    })
    expect(engine.value()).toEqual({})
  })
})
