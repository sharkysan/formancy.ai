import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createFormEngine, parsePath } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { resolveText } from '@formancy/spec'
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
import { FormancyForm, FormancyProvider } from './index.js'
import type { SubmitOutcome } from './index.js'

/**
 * The React renderer's conformance driver — the adapter the shared suite
 * drives this renderer through.
 *
 * Every control is resolved by ACCESSIBLE NAME AND ROLE, per the driver
 * contract: `getByLabelText`, `getByRole('button', { name })`, and `within` a
 * named group. No test ids, no CSS selectors for controls. Repeater rows share
 * their template's labels, so an instance path picks the nth match in
 * accessible order — the same disambiguation a screen reader user performs.
 */
export function createReactDriver(): RendererDriver {
  let engine: FormEngine | undefined
  let schema: ConformanceSchema | undefined
  let lastOutcome: SubmitOutcome | undefined

  const SUBMIT_LABEL = 'Submit'

  function requireMounted(): { engine: FormEngine; schema: ConformanceSchema } {
    if (engine === undefined || schema === undefined) throw new Error('driver is not mounted')
    return { engine, schema }
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
    const { schema } = requireMounted()
    return resolveText(schema, value, schema.i18n?.defaultLocale ?? '')
  }

  function labelOf(path: string): string {
    const { schema } = requireMounted()
    const label = textOf(fieldAtPath(schema, path)?.label)
    if (label === undefined) throw new Error(`No label for "${path}" — the fixture validator should have refused this`)
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

  async function settle(action: () => void): Promise<void> {
    await act(async () => {
      action()
      // Let wizard promises and effects run before the step asserts.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  return {
    async mount(mountSchema, options?: MountOptions) {
      cleanup()
      lastOutcome = undefined
      schema = mountSchema
      engine = createFormEngine({
        schema: mountSchema as unknown as FormSchema,
        initialValue: options?.initialValues,
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      })
      await act(async () => {
        render(
          <FormancyProvider engine={engine!}>
            <FormancyForm onSubmit={(outcome) => (lastOutcome = outcome)} submitLabel={SUBMIT_LABEL} />
          </FormancyProvider>,
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },

    async fill(path, value) {
      const { schema } = requireMounted()
      const def = fieldAtPath(schema, path)

      // A radio group is answered before any control lookup, because the group
      // itself has no labelled control: its accessible name is on the fieldset,
      // and the individual inputs are named by their own options.
      if (def?.type === 'radio') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const chosen = (def.options ?? []).find((option) => option.value === value)
        if (chosen === undefined) throw new Error(`No option "${String(value)}" on "${path}"`)
        await settle(() => {
          fireEvent.click(within(group).getByLabelText(textOf(chosen.label) ?? chosen.value))
        })
        return
      }

      // Checkboxes answering one question, the same shape as a radio group:
      // the accessible name is on the fieldset and each box is named by its
      // own option. The value is the whole list, so this sets every box to
      // match it rather than toggling one.
      if (def?.type === 'selectboxes') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const wanted = new Set((Array.isArray(value) ? value : []).map(String))
        for (const option of def.options ?? []) {
          const box = within(group).getByLabelText(
            textOf(option.label) ?? option.value,
          ) as HTMLInputElement
          if (box.checked !== wanted.has(option.value)) {
            await settle(() => {
              fireEvent.click(box)
            })
          }
        }
        return
      }

      const control = controlFor(path)
      if (control === undefined) throw new Error(`No control in the tree for "${path}"`)

      await settle(() => {
        if (def?.type === 'checkbox') {
          if ((control as HTMLInputElement).checked !== (value === true)) fireEvent.click(control)
        } else {
          fireEvent.focus(control)
          fireEvent.change(control, { target: { value: value === null ? '' : String(value) } })
          fireEvent.blur(control)
        }
      })
    },

    async activate(path) {
      const { schema } = requireMounted()
      await settle(() => {
        if (path === NEXT_COMMAND) {
          fireEvent.click(screen.getByRole('button', { name: 'Next' }))
          return
        }
        if (path === BACK_COMMAND) {
          fireEvent.click(screen.getByRole('button', { name: 'Back' }))
          return
        }
        const separator = path.lastIndexOf(COMMAND_SEPARATOR)
        const target = path.slice(0, separator)
        const command = path.slice(separator + 1)
        const repeaterWire = target.replace(/\[\d+\]$/, '')
        const def = fieldAtPath(schema, repeaterWire) as { addLabel?: string; removeLabel?: string } | undefined
        if (command === 'add') {
          fireEvent.click(screen.getByRole('button', { name: def?.addLabel ?? /^Add / }))
          return
        }
        if (command === 'remove') {
          const index = rowIndexOf(target) ?? 0
          const prefix = def?.removeLabel ?? 'Remove'
          const name = new RegExp(`^${escapeRegExp(prefix)} ${index + 1} of `)
          fireEvent.click(screen.getByRole('button', { name }))
          return
        }
        throw new Error(`Unknown command path "${path}"`)
      })
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
      const def = fieldAtPath(schema, path) as
        | { type?: string; options?: Array<{ value: string; label: unknown }> }
        | undefined
      if (def?.type === 'radio') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const checked = within(group)
          .getAllByRole('radio')
          .find((radio) => (radio as HTMLInputElement).checked)
        return checked === undefined ? null : (checked as HTMLInputElement).value
      }
      if (def?.type === 'selectboxes') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        // In the DOM's order, which is the options' order, which is the order
        // the engine stores them in. Reading them in click order would make
        // this pass against a renderer that stores them in click order too,
        // and the two renderers would then disagree about the same answers.
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
        // The ERROR target only. `aria-describedby` also carries the hint — a
        // required group says so there, because `role="group"` cannot carry
        // `aria-required` — and reading every target would report the word
        // "required" as a second error code on a field with one error.
        const errorId = engine.getFieldSnapshot(parsePath(candidate)).ids.error
        for (const id of describedBy.split(/\s+/)) {
          if (id !== errorId) continue
          // Trimmed: JSX happens not to introduce element-internal whitespace
          // today, but a reformat must not silently break code parsing.
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
      // Map the step's accessible name back to the page key it stands for.
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
      await settle(() => {
        fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
      })
      if (lastOutcome === undefined) throw new Error('the submit control reported no outcome')
      const outcome = lastOutcome
      lastOutcome = undefined
      const messages: ConformanceMessage[] = Object.entries(outcome.errors).flatMap(([errorPath, codes]) =>
        codes.map((code) => ({ path: errorPath, code })),
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
      cleanup()
      engine = undefined
      schema = undefined
    },
  }
}

/**
 * Run axe over the mounted form.
 *
 * `document.body` rather than a container element: Testing Library renders
 * into the body, and a form's error summary, live region and any portalled
 * content are siblings of the form rather than children of it. Auditing the
 * form element alone would skip exactly the parts that are hardest to get
 * right.
 *
 * The rule set is `@formancy/conformance`'s, not this file's. Two renderers
 * audited against two rule sets are not held to the same standard, and both
 * suites would be green while they drifted.
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
    // The summary axe attaches to each node is a paragraph of prose, and the
    // runner already prints the rule, the impact and the markup.
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
