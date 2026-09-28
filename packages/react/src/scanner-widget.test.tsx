import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, test } from 'vitest'

import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'

import { FormancyForm, FormancyProvider, ScannerProvider } from './index.js'
import type { Scanner } from './index.js'

afterEach(cleanup)

const CLOCK = { now: () => 0, today: () => '2026-09-27', random: () => 0.5 }

/**
 * `widget: "scanner"` on a text field — a camera route to a value somebody could
 * otherwise type.
 *
 * The same inversion the `file` field uses for its uploader: the renderer declares
 * a function and the HOST supplies it. A renderer cannot own camera permission
 * policy, cannot own a decoder, and must not grow a dependency for either — so the
 * scanner is a `Promise<string | null>` and everything behind it belongs to whoever
 * mounted the form ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 *
 * Which makes **undefined a supported state rather than a misconfiguration**, and
 * decides the first case below: with no scanner there is no button, because a Scan
 * button that does nothing is worse than no button. The field is still a text
 * input, because it always was — typing is both the accessibility floor and the
 * fallback, and neither is optional.
 *
 * The three things worth knowing about the rest:
 *
 * **The button's name carries the field's label.** A page with three scannable
 * fields otherwise offers three buttons called "Scan", and a screen-reader user
 * hears the same word three times with no way to tell which answer it fills in.
 *
 * **A device failure is not a wrong answer.** A refused permission goes to this
 * field's own `role="status"` region, never to the error region: that region is the
 * control's `aria-describedby` target, it belongs to validation, and its text comes
 * from the engine. Putting "camera refused" there would describe a hardware problem
 * as a wrong answer, and would mean a renderer writing into a region whose contents
 * the engine owns.
 *
 * **What the camera read is stored, and then validated like anything else.** A scan
 * a `pattern` refuses becomes the field's value and the field's error, exactly as
 * typing it would. Dropping it instead would discard the only record of what the
 * camera saw and leave the field silently empty.
 */
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

function mount(scan?: Scanner, widget: 'scanner' | undefined = 'scanner'): FormEngine {
  const engine = createFormEngine({ schema: schema(widget), capabilities: CLOCK })
  render(
    <FormancyProvider engine={engine}>
      {scan === undefined ? (
        <FormancyForm />
      ) : (
        <ScannerProvider value={scan}>
          <FormancyForm />
        </ScannerProvider>
      )}
    </FormancyProvider>,
  )
  return engine
}

const statusOf = (label: string): string =>
  screen.getByRole('textbox', { name: label }).closest('[data-formancy-part="field"]')!
    .querySelector('[data-formancy-part="scanner-status"]')!.textContent ?? ''

describe('a text field with the scanner widget', () => {
  test('is a text box with the same name, whether a scanner is there or not', () => {
    // The conformance floor. Every fixture finds a text field by role `textbox` and
    // its accessible name, so a widget that wrapped the input in something else, or
    // renamed it, would fail the suite for both renderers
    // ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
    mount(async () => 'ABC123')
    expect(screen.getByRole('textbox', { name: 'Serial number' }).getAttribute('type')).toBe('text')

    cleanup()
    mount(undefined, undefined)
    expect(screen.getByRole('textbox', { name: 'Serial number' }).getAttribute('type')).toBe('text')
  })

  test('offers no scan button when no scanner was supplied, and still takes typing', async () => {
    // The failure this prevents: a button that opens nothing. A host with no camera
    // route is the ordinary case, not a mistake, so the widget's only visible effect
    // is absent and the field is exactly the default control.
    const user = userEvent.setup()
    const engine = mount(undefined)

    expect(screen.queryByRole('button', { name: /^Scan/ })).toBeNull()

    await user.type(screen.getByRole('textbox', { name: 'Serial number' }), 'ABC123')
    expect(engine.value()).toEqual({ serial: 'ABC123' })
  })

  test('names each scan button after its own field', () => {
    // The failure this prevents: two buttons called "Scan" on one page. The visible
    // word stays "Scan" and the label is appended for the accessible name, so the
    // name still CONTAINS the visible text (WCAG 2.5.3) and the two fields are
    // distinguishable by name alone — which is all a conformance driver may use.
    mount(async () => 'ABC123')

    expect(screen.getByRole('button', { name: 'Scan Serial number' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Scan Voucher code' })).toBeDefined()
  })

  test('stores exactly the string the scanner returned, as typing would', async () => {
    // The line a widget may not cross: it changes how a field looks, never what it
    // collects ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
    // Asserted on the engine's value rather than on the input, because the value is
    // what a submission carries.
    const user = userEvent.setup()
    const engine = mount(async () => 'ABC123')

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(engine.value()).toEqual({ serial: 'ABC123' })
    })
    expect(screen.getByRole('textbox', { name: 'Serial number' })).toHaveProperty(
      'value',
      'ABC123',
    )
  })

  test('stores a multi-line payload the way the input would', async () => {
    // The failure this prevents: a widget changing what a field collects. A code carries
    // several lines (a Wi-Fi or vCard payload does), and `<input type="text">` strips CR and
    // LF from everything typed or pasted -- HTML's value sanitization algorithm -- so storing
    // them verbatim would put a value in the answer that typing cannot produce.
    //
    // jsdom does not implement that sanitiser, so this assertion is the only thing here that
    // knows the difference.
    const user = userEvent.setup()
    const engine = mount(async () => 'WIFI:S:home;\r\nP:secret;;')

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(engine.value()).toEqual({ serial: 'WIFI:S:home;P:secret;;' })
    })
  })

  test('tells the scanner which field it is scanning for', async () => {
    // So a host's camera sheet can say what it is looking for. Without the label a
    // sheet over a form with three scannable fields cannot title itself, and the
    // person holding the phone cannot tell which answer they are filling in.
    const user = userEvent.setup()
    const asked: Array<{ label: string; path: string }> = []
    mount(async (request) => {
      asked.push({ label: request.label, path: request.path })
      return null
    })

    await user.click(screen.getByRole('button', { name: 'Scan Voucher code' }))

    await waitFor(() => {
      expect(asked).toEqual([{ label: 'Voucher code', path: 'voucher' }])
    })
  })

  test('stores a scan the pattern refuses, and lets the engine judge it', async () => {
    // The failure this prevents: a renderer second-guessing the engine. Checking the
    // pattern here and dropping the value would throw away the only record of what
    // the camera read and leave the field looking empty — so the scan is stored, and
    // it is refused at exactly the moment a typed value would be, by the engine, in
    // the field's own error region.
    //
    // Submit is part of the case rather than a detail of it: errors track edits only
    // after the first validation, so a scanned value that is wrong is no louder and
    // no quieter than a typed one ([0022](../../../docs/decisions/0022-fail-open-fail-closed.md)).
    const user = userEvent.setup()
    const engine = mount(async () => 'not-a-serial')

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(engine.value()).toEqual({ serial: 'not-a-serial' })
    })

    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      const field = screen
        .getByRole('textbox', { name: 'Serial number' })
        .closest('[data-formancy-part="field"]')!
      expect(field.querySelector('[data-formancy-part="error"]')?.textContent).toBe('pattern')
    })
    // Still there afterwards: refusing it is the engine's answer, not a reason to
    // forget what the camera read.
    expect(engine.value()).toEqual({ serial: 'not-a-serial' })
  })

  test('puts a refused camera in the status region and never in the error region', async () => {
    // The failure this prevents: a hardware problem that reads as a wrong answer. The
    // error region is the control's describedby target, it holds the engine's
    // verdicts, and it only appears once a field is touched and invalid — a renderer
    // writing a device message into it would be lying about the engine's state.
    const user = userEvent.setup()
    const engine = mount(async () => {
      throw new Error('Camera permission was refused')
    })

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(statusOf('Serial number')).toContain('Camera permission was refused')
    })
    // Named as recoverable, because it is: the input is right there.
    expect(statusOf('Serial number')).toContain('Type the value instead')

    const field = screen
      .getByRole('textbox', { name: 'Serial number' })
      .closest('[data-formancy-part="field"]')!
    expect(field.querySelector('[data-formancy-part="error"]')).toBeNull()

    // And the field is still fillable, which is the whole reason the fallback is the
    // default control rather than a read-only box.
    await user.type(screen.getByRole('textbox', { name: 'Serial number' }), 'ABC123')
    expect(engine.value()).toEqual({ serial: 'ABC123' })
  })

  test('says nothing when somebody closes the camera without scanning', async () => {
    // A cancel is not a failure, and an apology for a decision somebody made on
    // purpose is noise in a live region. `null` is the cancel; a rejection is the
    // failure; the two are deliberately different answers.
    const user = userEvent.setup()
    const engine = mount(async () => null)

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

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
    // The structural half of "a widget never changes what a field collects". The only
    // call to setValue in this control takes a string, so a host written in plain
    // JavaScript that resolves with `{ text: 'ABC123' }` cannot put an object into a
    // text field: it is reported as a device failure, which is what it is.
    const user = userEvent.setup()
    const engine = mount((async () => ({ text: 'ABC123' })) as unknown as Scanner)

    await user.click(screen.getByRole('button', { name: 'Scan Serial number' }))

    await waitFor(() => {
      expect(statusOf('Serial number')).toContain('did not return text')
    })
    expect(engine.value()).toEqual({})
  })
})
