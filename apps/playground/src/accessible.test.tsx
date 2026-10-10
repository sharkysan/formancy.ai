import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import axe from 'axe-core'
import { computeAccessibleName } from 'dom-accessibility-api'

import {
  ACCESSIBILITY_EXCLUSIONS,
  ACCESSIBILITY_TAGS,
  ACCESSIBILITY_UNMEASURABLE_IN_JSDOM,
} from '@formancy/conformance'

import { missingMessages } from '@formancy/builder-core'
import type { FormSchema } from '@formancy/spec'
import { App } from './app.js'
import { STARTER_SCHEMA } from './starter.js'
import { STARTER_SUGGESTIONS } from './starter-suggestions.js'

/**
 * Every control on the playground has a name a screen reader can say.
 *
 * The forms this tool PRODUCES have been audited since the beginning — axe runs
 * after every mount in both renderers, and the conformance drivers may find an
 * element only by role and accessible name, so markup that is not navigable
 * fails the suite outright
 * ([0034](../../../docs/decisions/0034-accessible-name-only.md)).
 *
 * The tool ITSELF never was. That is the gap this file closes, and it is the
 * more embarrassing half: a form builder whose own screen cannot be used by a
 * screen reader is a poor advertisement for forms that can.
 *
 * Two checks, because neither alone is enough. axe finds roughly half of what
 * is machine-detectable and says nothing about a control it considers named by
 * something useless; so the first test computes every interactive control's
 * accessible name with a real implementation and refuses an empty one, and the
 * second runs the same audit configuration the renderers use.
 */
vi.mock('@monaco-editor/react', () => ({
  // Monaco loads a worker and measures a DOM jsdom does not have. Replaced with a
  // real labelled textarea, so the editor still answers to a name here.
  default: ({ value }: { value?: string }) => (
    <textarea readOnly aria-label="Schema" value={value ?? ''} />
  ),
  useMonaco: () => null,
}))

afterEach(cleanup)

/**
 * Everything a person operates, AND everything that speaks on its own.
 *
 * Disabled controls are included on purpose: a disabled control is still
 * announced, and "button" with no name tells somebody nothing about what they
 * cannot do yet. Hidden ones are excluded, because they are not there.
 *
 * `<output>` is here because a person found what the first version of this
 * guard missed: the QR code's value is an `<output>`, its label was a loose
 * span beside it, and the computed name was the empty string — so a screen
 * reader read a booking reference out of nowhere.
 *
 * And the OTHER live regions are deliberately NOT here, which is the more
 * interesting half. `role="status"` does not require an accessible name, and
 * every one on this page says a whole sentence: "No options match", "Scanning
 * did not work: the camera was refused. Type the value instead." A region whose
 * announcement explains itself needs no name, and demanding one would make this
 * guard insist on a worse page. `<output>` is the exception because what it
 * announces is a bare value — "AB-1234" — which explains nothing.
 */
const operable = (): HTMLElement[] =>
  [
    ...document.querySelectorAll<HTMLElement>(
      [
        'button, input, select, textarea, a[href]',
        '[role="tab"], [role="treeitem"], [role="option"]',
        // `<output>` speaks without being operated, and what it speaks is a VALUE.
        'output',
      ].join(', '),
    ),
  ].filter((element) => element.closest('[hidden]') === null)

const unnamed = (): string[] =>
  operable()
    .filter((element) => computeAccessibleName(element).trim() === '')
    .map((element) => {
      const part = element.getAttribute('data-formancy-part')
      return `<${element.tagName.toLowerCase()}${
        part === null ? '' : ` data-formancy-part="${part}"`
      }> near "${(element.closest('section, div')?.textContent ?? '').trim().slice(0, 60)}"`
    })

/**
 * The panes, audited one at a time.
 *
 * They SWAP rather than stack, so only one is in the document at once — and the first
 * version of this opened the arrangement, clicked back to the fields and then ran axe,
 * which audited the fields twice and the arrangement never. The name check beside it did
 * open the arrangement, so the gap was invisible: one of the two checks covered both panes
 * and the other covered one, and nothing said which.
 *
 * `Fields` is what the tool opens on, so it needs no click.
 *
 * `Translations` is audited from the day it reached the page, because it brings
 * controls no other pane has: a file input, a text box for every message, and a third
 * rendering of the form under them. Unaudited, any of those could ship without a name
 * and only a screen reader would find out.
 *
 * And the Fields pane with a model's turn waiting to be carried (0160): the relay pane is
 * drawn only then, so a page audited at rest never sees its two text boxes, its Copy and
 * its link to a chat.
 *
 * And the Translations pane with a model's French under review (0161): a table of what it
 * would write, its actions, and a fourth rendering of the form — the French as proposed,
 * beside the pane's own preview of the form as it is. Two previews of one form mint every
 * id twice unless the second is given ids of its own, which is what axe is here to see.
 *
 * And Fields and Translations in the Angular builder, because the starter's suggestions are
 * drawn by each builder beside its own panes: the page's markup in two frameworks, and only
 * the React one was ever in front of this audit.
 */
const PANES = [
  'Fields',
  'Arrangement',
  'Translations',
  'Fields, with a turn to carry',
  'Translations, with French to review',
  'Fields, in the Angular builder',
  'Translations, in the Angular builder',
] as const

async function showing(pane: (typeof PANES)[number]): Promise<void> {
  render(<App />)

  /*
   * Wait for the Angular renderer before auditing anything.
   *
   * The page shows the document under both renderers, and Angular bootstraps
   * asynchronously — so without this the audit ran against a page with ONE form
   * and reported it clean. Duplicate element ids are exactly what axe catches
   * and exactly what two renderers of one schema produce, so the half of the
   * page most likely to fail was the half not being looked at.
   */
  await waitFor(
    () => {
      const angular = screen.getByRole('region', { name: 'Angular' })
      expect(
        within(angular).queryByRole('textbox', { name: 'First name' }),
        'the Angular renderer never rendered, so this audit covers half the page',
      ).not.toBeNull()
    },
    { timeout: 10_000 },
  )

  if (pane === 'Fields') return
  const user = userEvent.setup()
  if (pane === 'Fields, in the Angular builder' || pane === 'Translations, in the Angular builder') {
    await user.selectOptions(screen.getByRole('combobox', { name: 'Builder' }), 'angular')
    await waitFor(() => expect(screen.getAllByRole('tree', { name: /structure/i }).length).toBeGreaterThan(0), {
      timeout: 10_000,
    })
    if (pane === 'Translations, in the Angular builder') {
      await user.click(screen.getByRole('button', { name: 'Translations' }))
      const editor = screen.getByRole('region', { name: 'Editor' })
      await within(editor).findByRole('combobox', { name: 'Language' }, { timeout: 10_000 })
    }
    return
  }
  if (pane === 'Fields, with a turn to carry') {
    await user.type(screen.getByRole('textbox', { name: /Describe the form/ }), 'add a phone number')
    await user.click(screen.getByRole('button', { name: 'Write it' }))
    await screen.findByRole('region', { name: 'Take this request to a model' })
    return
  }
  if (pane === 'Translations, with French to review') {
    await user.click(screen.getByRole('button', { name: 'Translations' }))
    const editor = screen.getByRole('region', { name: 'Editor' })
    await user.selectOptions(within(editor).getByRole('combobox', { name: 'Language' }), 'fr')
    await user.click(within(editor).getByRole('button', { name: /^Ask a model for the/ }))
    // Every missing message answered, as a chat would, through the page's relay.
    const english = STARTER_SCHEMA.i18n.messages['en'] ?? {}
    const answer = JSON.stringify({
      locale: 'fr',
      defaultLocale: 'en',
      messages: missingMessages(STARTER_SCHEMA as unknown as FormSchema, 'fr').map((id) => ({
        id,
        source: english[id],
        target: `${english[id] ?? id} (fr)`,
      })),
    })
    const relay = await screen.findByRole('region', { name: 'Take this request to a model' })
    await user.click(within(relay).getByRole('textbox', { name: 'The model’s answer' }))
    await user.paste(answer)
    await user.click(within(relay).getByRole('button', { name: 'Check this answer' }))
    await within(editor).findByRole('region', { name: /^Review these translations into fr/ }, { timeout: 10_000 })
    return
  }
  await user.click(screen.getByRole('button', { name: pane }))
}

describe('the playground itself is operable by name', () => {
  test.each([
    ['Fields', ['prompt', 'drafting']],
    ['Translations', ['translation']],
    ['Fields, in the Angular builder', ['prompt', 'drafting']],
    ['Translations, in the Angular builder', ['translation']],
  ] as const)('the starter’s suggestions are among what the %s pane is audited with', async (pane, features) => {
    // A guard on the guards below: they audit what is drawn, and a suggestion that was not
    // drawn when they ran would pass them without ever being looked at.
    await showing(pane)
    const expected = STARTER_SUGGESTIONS.filter(({ feature }) => (features as readonly string[]).includes(feature))
    expect(expected).not.toEqual([])
    const audited = operable().map((element) => computeAccessibleName(element))
    expect(expected.filter(({ words }) => !audited.includes(words))).toEqual([])
  })

  test.each(PANES)('every control in the %s pane has an accessible name', async (pane) => {
    await showing(pane)

    // A guard on the guard: a query that found nothing would pass forever.
    expect(operable().length).toBeGreaterThan(10)
    expect(unnamed()).toEqual([])
  })

  test.each(PANES)(
    'axe finds nothing in the %s pane, in the configuration the renderers are held to',
    async (pane) => {
      await showing(pane)

      const results = await axe.run(document.body, {
        runOnly: { type: 'tag', values: [...ACCESSIBILITY_TAGS] },
        // Both are `Record<rule, why>`: the reason is the point of them, so the exclusion
        // cannot be a bare list somebody adds to without saying why.
        rules: Object.fromEntries(
          [
            ...Object.keys(ACCESSIBILITY_EXCLUSIONS),
            ...Object.keys(ACCESSIBILITY_UNMEASURABLE_IN_JSDOM),
          ].map((rule) => [rule, { enabled: false }]),
        ),
      })

      expect(
        results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`),
      ).toEqual([])
    },
  )
})
