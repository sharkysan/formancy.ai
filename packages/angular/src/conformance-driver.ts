import { provideZonelessChangeDetection } from '@angular/core'
import type { Provider } from '@angular/core'
import type { ComponentFixture } from '@angular/core/testing'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import axe from 'axe-core'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { createFormText } from '@formancy/core/words'
import type { FormText } from '@formancy/core/words'
import { answerFromText, resolveText, resolvedLocale } from '@formancy/spec'
import type { FormSchema, Text } from '@formancy/spec'
import {
  ACCESSIBILITY_EXCLUSIONS,
  ACCESSIBILITY_TAGS,
  ACCESSIBILITY_UNMEASURABLE_IN_JSDOM,
  BACK_COMMAND,
  COMMAND_SEPARATOR,
  NEXT_COMMAND,
  fieldAtPath,
} from '@formancy/conformance'
import type {
  AccessibilityViolation,
  ConformanceMessage,
  ConformanceSchema,
  JsonValue,
  MountOptions,
  RendererDriver,
  SubmitResult,
} from '@formancy/conformance'
import { FormancyForm, provideFormancy } from './index.js'
import type { SubmitOutcome } from './index.js'

/**
 * The Angular renderer's conformance driver — the adapter the shared suite
 * drives this renderer through.
 *
 * Every control is resolved by ACCESSIBLE NAME AND ROLE, per the driver
 * contract: `getByLabelText`, `getByRole('button', { name })`, and `within` a
 * named group. No test ids, no CSS selectors for controls. Repeater rows share
 * their template's labels, so an instance path picks the nth match in
 * accessible order — the same disambiguation a screen reader user performs.
 *
 * Zoneless: nothing schedules change detection but signals, so every
 * interaction settles through `fixture.whenStable()` plus one macrotask — the
 * macrotask is for the wizard, whose `next()` resolves a promise before the
 * page signal moves.
 *
 * The renderer's own controls — Next, Back, Submit, a row's remove button, a ranking's —
 * are pressed by the words the renderer draws for them, read from the form's catalogue in
 * the locale the form was MOUNTED in, as the React driver does (0171).
 */
export function createAngularDriver(
  /**
   * Providers added to every mount — how the Material adapter runs this suite with its
   * registry in place, so a design system is held to the same fixtures as the defaults.
   */
  extra: { providers?: readonly Provider[] } = {},
): RendererDriver {
  let engine: FormEngine | undefined
  let schema: ConformanceSchema | undefined
  let fixture: ComponentFixture<FormancyForm> | undefined
  let lastOutcome: SubmitOutcome | undefined
  let words: FormText | undefined

  function requireMounted(): { engine: FormEngine; schema: ConformanceSchema; words: FormText } {
    if (engine === undefined || schema === undefined || words === undefined) {
      throw new Error('driver is not mounted')
    }
    return { engine, schema, words }
  }

  /** The row index a path addresses, or undefined for a static path. */
  function rowIndexOf(path: string): number | undefined {
    const match = /\[(\d+)\]/.exec(path)
    return match === null ? undefined : Number(match[1])
  }

  /**
   * The accessible name the renderer will have produced — resolved through the
   * message catalogue, exactly as the renderer resolves it. Reading `label` raw
   * would look up "[object Object]" the moment a fixture uses a translation.
   */
  function textOf(value: Text | undefined): string | undefined {
    const { schema, engine: mounted } = requireMounted()
    /*
     * The locale the form was MOUNTED in, not the document's default.
     *
     * A fixture may ask for another one, and resolving here in the default
     * would look up an English name against a German page — or, worse, agree
     * with a renderer that had also ignored the request, so the pair passed
     * while neither translated anything.
     */
    return resolveText(schema, value, mounted.locale())
  }

  function labelOf(path: string): string {
    const { schema } = requireMounted()
    const label = textOf(fieldAtPath(schema, path)?.label)
    if (label === undefined) {
      throw new Error(`No label for "${path}" — the fixture validator should have refused this`)
    }
    return label
  }

  /** Resolve the control for a data path by its accessible name, picking the
   *  nth match for a row instance. Returns undefined when not in the tree. */
  function controlFor(path: string): HTMLElement | undefined {
    const label = labelOf(path)
    const index = rowIndexOf(path) ?? 0
    const labelled = screen.queryAllByLabelText(label)
    if (labelled[index] !== undefined) return labelled[index]

    // A field answered by several controls — a radio group, a checkbox group —
    // has its accessible name on the fieldset, and a legend is not a label, so
    // the query above finds nothing. Falling back to the group is what makes
    // those fields visible to `visibleFields` and gives `errorsFor` something
    // to read `aria-describedby` from; without it the driver reports a whole
    // question as absent from the form.
    return screen.queryAllByRole('group', { name: label })[index]
  }

  async function settle(): Promise<void> {
    if (fixture === undefined) return
    await fixture.whenStable()
    // Let wizard promises and effects run before the step asserts.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await fixture.whenStable()
  }

  return {
    async mount(mountSchema, options?: MountOptions) {
      TestBed.resetTestingModule()
      document.body.innerHTML = ''
      lastOutcome = undefined
      schema = mountSchema
      engine = createFormEngine({
        schema: mountSchema as unknown as FormSchema,
        initialValue: options?.initialValues,
        // The suite may ask for a locale; a driver that drops it certifies
        // nothing about translation. Both drivers dropped it.
        ...(options?.locale === undefined ? {} : { locale: options.locale }),
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      })
      // The locale the document is read in, as the renderer reads it (0171).
      words = createFormText({ locale: resolvedLocale(engine.schema(), engine.locale()) })
      const view = await render(FormancyForm, {
        providers: [
          provideZonelessChangeDetection(),
          provideFormancy(engine),
          ...(extra.providers ?? []),
        ],
        // No `submitLabel`: the button is found by the form's own word for it, so the
        // suite holds the default rather than a name the driver chose.
        inputs: options?.layout === undefined ? {} : { layout: options.layout },
        on: { submitted: (outcome: SubmitOutcome) => (lastOutcome = outcome) },
      })
      fixture = view.fixture
      await settle()
    },

    async fill(path, value) {
      const { schema } = requireMounted()
      const def = fieldAtPath(schema, path)

      if (def?.type === 'radio') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const chosen = (def.options ?? []).find((option) => option.value === value)
        if (chosen === undefined) throw new Error(`No option "${String(value)}" on "${path}"`)
        fireEvent.click(within(group).getByLabelText(textOf(chosen.label) ?? chosen.value))
        await settle()
        return
      }

      // Checkboxes answering one question, the same shape as a radio group.
      // The value is the whole list, so every box is set to match it rather
      // than one being toggled.
      // Row by row, as the React driver does it: in the row's group, the column's radio.
      if (def?.type === 'matrix') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const answers = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
        for (const [rowValue, columnValue] of Object.entries(answers)) {
          const row = (def.rows ?? []).find((candidate) => candidate.value === rowValue)
          const column = (def.options ?? []).find((candidate) => candidate.value === columnValue)
          const rowGroup = within(group).getByRole('group', { name: textOf(row?.label) ?? rowValue })
          fireEvent.click(
            within(rowGroup).getByRole('radio', { name: textOf(column?.label) ?? String(columnValue) }),
          )
          await settle()
        }
        return
      }

      // As the React driver does it, and as a person does: everything taken out, then
      // each option ranked in turn, by the buttons' names.
      if (def?.type === 'ranking') {
        const { words } = requireMounted()
        const group = screen.getByRole('group', { name: labelOf(path) })
        for (;;) {
          const out = within(group).queryAllByRole('button', { name: pattern(words('ranking.remove')) })[0]
          if (out === undefined) break
          fireEvent.click(out)
          await settle()
        }
        for (const wanted of Array.isArray(value) ? value : []) {
          const option = (def.options ?? []).find((candidate) => candidate.value === wanted)
          fireEvent.click(
            within(group).getByRole('button', {
              name: words('ranking.rank', { option: textOf(option?.label) ?? String(wanted) }),
            }),
          )
          await settle()
        }
        return
      }

      if (def?.type === 'selectboxes') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const wanted = new Set((Array.isArray(value) ? value : []).map(String))
        for (const option of def.options ?? []) {
          const box = within(group).getByLabelText(
            textOf(option.label) ?? option.value,
          ) as HTMLInputElement
          if (box.checked !== wanted.has(option.value)) fireEvent.click(box)
        }
        await settle()
        return
      }

      const control = controlFor(path)
      if (control === undefined) throw new Error(`No control in the tree for "${path}"`)

      if (def?.type === 'checkbox') {
        if ((control as HTMLInputElement).checked !== (value === true)) fireEvent.click(control)
      } else if (def?.type === 'select') {
        fireEvent.focus(control)
        fireEvent.change(control, { target: { value: value === null ? '' : String(value) } })
        fireEvent.blur(control)
      } else {
        fireEvent.focus(control)
        fireEvent.input(control, { target: { value: value === null ? '' : String(value) } })
        fireEvent.blur(control)
      }
      await settle()
    },

    async activate(path) {
      const { schema, words } = requireMounted()
      if (path === NEXT_COMMAND) {
        fireEvent.click(screen.getByRole('button', { name: words('form.next') }))
        await settle()
        return
      }
      if (path === BACK_COMMAND) {
        fireEvent.click(screen.getByRole('button', { name: words('form.back') }))
        await settle()
        return
      }
      const separator = path.lastIndexOf(COMMAND_SEPARATOR)
      const target = path.slice(0, separator)
      const command = path.slice(separator + 1)
      const repeaterWire = target.replace(/\[\d+\]$/, '')
      const def = fieldAtPath(schema, repeaterWire)
      // The document's words, or the form's when it has none — the renderer's rule.
      const label = textOf(def?.label) ?? repeaterWire
      if (command === 'add') {
        fireEvent.click(screen.getByRole('button', { name: def?.addLabel ?? words('repeater.add', { label }) }))
        await settle()
        return
      }
      if (command === 'remove') {
        const index = rowIndexOf(target) ?? 0
        const remove = def?.removeLabel ?? words('repeater.remove', { label })
        // The row's position is in its name; how many rows there are is left open.
        const name = pattern(words('repeater.removeRow', { remove, position: index + 1 }))
        fireEvent.click(screen.getByRole('button', { name }))
        await settle()
        return
      }
      throw new Error(`Unknown command path "${path}"`)
    },

    async visibleFields() {
      const { engine } = requireMounted()
      // Candidate instances come from the engine (it knows the current rows);
      // VISIBILITY comes from the accessible tree: a candidate whose label
      // resolves to no control is not reachable by a person, so it is hidden.
      return engine.fieldPaths().filter((path) => {
        try {
          return controlFor(path) !== undefined
        } catch {
          return false
        }
      })
    },

    async valueOf(path) {
      const { schema } = requireMounted()
      const def = fieldAtPath(schema, path)
      if (def?.type === 'radio') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const checked = within(group)
          .getAllByRole('radio')
          .find((radio) => (radio as HTMLInputElement).checked)
        return checked === undefined ? null : (checked as HTMLInputElement).value
      }
      if (def?.type === 'matrix') {
        // Each row's checked radio, as the React driver reads it.
        const group = screen.getByRole('group', { name: labelOf(path) })
        const read: Record<string, string> = {}
        for (const row of (def as { rows?: Array<{ value: string; label: Text }> }).rows ?? []) {
          const rowGroup = within(group).getByRole('group', { name: textOf(row.label) ?? row.value })
          const checked = within(rowGroup)
            .getAllByRole('radio')
            .find((radio) => (radio as HTMLInputElement).checked)
          if (checked !== undefined) read[row.value] = (checked as HTMLInputElement).value
        }
        return read
      }
      if (def?.type === 'ranking') {
        // The order on screen, read from the move buttons' names, as the React driver reads it.
        const { words } = requireMounted()
        const group = screen.getByRole('group', { name: labelOf(path) })
        const up = pattern(words('ranking.up'))
        return within(group)
          .queryAllByRole('button', { name: up })
          .map((button) => up.exec(button.getAttribute('aria-label') ?? '')?.[1] ?? '')
          .map(
            (shown) =>
              (def.options ?? []).find((option) => textOf(option.label as Text) === shown)?.value ??
              shown,
          )
      }
      if (def?.type === 'selectboxes') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        // In the DOM's order, which is the options' order, which is the order
        // the engine stores them in — and the same order the React driver
        // reads. Reading them in click order would let the two renderers
        // disagree about the same answers while both passed.
        return within(group)
          .getAllByRole('checkbox')
          .filter((box) => (box as HTMLInputElement).checked)
          .map((box) => (box as HTMLInputElement).value)
      }
      const control = controlFor(path)
      if (control === undefined) throw new Error(`No control in the tree for "${path}"`)
      if (def?.type === 'checkbox') return (control as HTMLInputElement).checked
      const raw = (control as HTMLInputElement).value
      if (def?.type === 'number') return raw === '' ? null : Number(raw)
      // A masked control shows the answer in its shape; the answer is read off it the
      // way a person reads the number off the screen, by the one function both
      // renderers edit through. A renderer that drew the shape wrong reads back wrong.
      if (def?.mask !== undefined) return answerFromText(def.mask, raw)
      // Read THROUGH the control: a text control cannot display null, so its
      // empty state is the empty string, verbatim.
      return raw
    },

    async errorsFor(path) {
      const { engine } = requireMounted()
      const paths = path === undefined ? engine.fieldPaths() : [path]
      const messages: ConformanceMessage[] = []
      for (const candidate of paths) {
        const control = (() => {
          try {
            return controlFor(candidate)
          } catch {
            return undefined
          }
        })()
        const describedBy = control?.getAttribute('aria-describedby')
        if (describedBy == null) continue
        // The ERROR target only. aria-describedby also carries the hint — a
        // required group says so there, because role=group cannot carry
        // aria-required — and reading every target would report the word
        // "required" as a second error code on a field with one error.
        const errorId = engine.getFieldSnapshot(parsePath(candidate)).ids.error
        for (const id of describedBy.split(/\s+/)) {
          if (id !== errorId) continue
          const text = document.getElementById(id)?.textContent?.trim()
          if (text == null || text === '') continue
          for (const code of text.split(', ')) messages.push({ path: candidate, code, text })
        }
      }
      return messages
    },

    async currentPage() {
      const { schema } = requireMounted()
      const active = document.querySelector('[aria-current="step"]')
      if (active === null) return undefined
      const name = (active.textContent ?? '').trim()
      // Map the step's accessible name back to the page key it stands for — resolved in
      // the mounted locale, as the React driver resolves it. This compared the raw label,
      // so a page labelled by a message reference was never recognised; no fixture had one
      // until the renderer's words were mounted in German (0171).
      for (const field of schema.model.fields) {
        if (field.type === 'page' && (textOf(field.label) ?? field.key) === name) return field.key
      }
      return name
    },

    async ariaSnapshot() {
      const { engine } = requireMounted()
      const lines: string[] = []
      for (const path of engine.fieldPaths()) {
        try {
          const control = controlFor(path)
          if (control !== undefined) {
            lines.push(`- ${labelOf(path)} [${path}]: ${(control as HTMLInputElement).value ?? ''}`)
          }
        } catch {
          // A path without a label has no accessible identity to render.
        }
      }
      return lines.join('\n')
    },

    async submit(): Promise<SubmitResult> {
      const { words } = requireMounted()
      fireEvent.click(screen.getByRole('button', { name: words('form.submit') }))
      await settle()
      if (lastOutcome === undefined) throw new Error('the submit control reported no outcome')
      const outcome = lastOutcome
      lastOutcome = undefined
      const messages: ConformanceMessage[] = Object.entries(outcome.errors).flatMap(
        ([errorPath, codes]) => codes.map((code) => ({ path: errorPath, code })),
      )
      if (outcome.ok) {
        return { status: 'accepted', data: outcome.data as JsonValue, messages }
      }
      return { status: 'rejected', messages }
    },

    async audit(): Promise<readonly AccessibilityViolation[]> {
      requireMounted()
      return auditRendered()
    },

    async unmount() {
      TestBed.resetTestingModule()
      document.body.innerHTML = ''
      engine = undefined
      schema = undefined
      fixture = undefined
      lastOutcome = undefined
      words = undefined
    },
  }
}

/**
 * Run axe over the mounted form.
 *
 * `document.body`, not the component's host: the error summary and the live
 * region are siblings of the form rather than children of it, and auditing the
 * form element alone would skip the parts that are hardest to get right.
 *
 * The rule set comes from `@formancy/conformance`, the same one the React
 * driver uses. Two renderers audited against two rule sets are not held to the
 * same standard, and both suites would be green while they drifted.
 */
async function auditRendered(): Promise<readonly AccessibilityViolation[]> {
  const disabled = {
    ...ACCESSIBILITY_EXCLUSIONS,
    ...ACCESSIBILITY_UNMEASURABLE_IN_JSDOM,
  }
  const rules = Object.fromEntries(
    Object.keys(disabled).map((id) => [id, { enabled: false }] as const),
  )

  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: [...ACCESSIBILITY_TAGS] },
    rules,
    resultTypes: ['violations'],
  })

  return results.violations.map((violation) => ({
    id: violation.id,
    ...(violation.impact === undefined || violation.impact === null
      ? {}
      : { impact: violation.impact }),
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => node.html),
  }))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A name with a value left open, as a pattern: the form's sentence, with `(.+)` where each
 * placeholder it was not given stays visible — the React driver's, for the same names.
 */
function pattern(sentence: string): RegExp {
  return new RegExp(`^${escapeRegExp(sentence).replace(/\\\{\w+\\\}/g, '(.+)')}$`)
}
