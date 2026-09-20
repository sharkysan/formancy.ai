import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import type { FormSchema } from '@formancy/spec'
import { BACK_COMMAND, COMMAND_SEPARATOR, NEXT_COMMAND, fieldAtPath } from '@formancy/conformance'
import type {
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

  function labelOf(path: string): string {
    const { schema } = requireMounted()
    const def = fieldAtPath(schema, path)
    const label = (def as { label?: string } | undefined)?.label
    if (label === undefined) throw new Error(`No label for "${path}" — the fixture validator should have refused this`)
    return label
  }

  /** Resolve the control for a data path by its accessible name, picking the
   *  nth match for a row instance. Returns undefined when not in the tree. */
  function controlFor(path: string): HTMLElement | undefined {
    const label = labelOf(path)
    const matches = screen.queryAllByLabelText(label)
    const index = rowIndexOf(path) ?? 0
    return matches[index]
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
      const def = fieldAtPath(schema, path) as { type?: string } | undefined
      const control = controlFor(path)
      if (control === undefined) throw new Error(`No control in the tree for "${path}"`)

      await settle(() => {
        if (def?.type === 'checkbox') {
          if ((control as HTMLInputElement).checked !== (value === true)) fireEvent.click(control)
        } else if (def?.type === 'radio') {
          const group = screen.getByRole('group', { name: labelOf(path) })
          const options = (fieldAtPath(schema, path) as unknown as { options?: Array<{ value: string; label: string }> }).options ?? []
          const chosen = options.find((option) => option.value === value)
          if (chosen === undefined) throw new Error(`No option "${String(value)}" on "${path}"`)
          fireEvent.click(within(group).getByLabelText(chosen.label))
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
      const def = fieldAtPath(schema, path) as { type?: string } | undefined
      if (def?.type === 'radio') {
        const group = screen.getByRole('group', { name: labelOf(path) })
        const checked = within(group)
          .getAllByRole('radio')
          .find((radio) => (radio as HTMLInputElement).checked)
        return checked === undefined ? null : (checked as HTMLInputElement).value
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
        for (const id of describedBy.split(/\s+/)) {
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
        const extras = field as { type?: string; key?: string; label?: string }
        if (extras.type === 'page' && (extras.label ?? extras.key) === name) return extras.key
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

    async unmount() {
      cleanup()
      engine = undefined
      schema = undefined
    },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
