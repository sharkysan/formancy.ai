import { provideZonelessChangeDetection } from '@angular/core'
import type { ComponentFixture } from '@angular/core/testing'
import { TestBed } from '@angular/core/testing'
import { fireEvent, render, screen, within } from '@testing-library/angular'
import { createFormEngine } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { resolveText } from '@formancy/spec'
import type { FormSchema, Text } from '@formancy/spec'
import { BACK_COMMAND, COMMAND_SEPARATOR, NEXT_COMMAND, fieldAtPath } from '@formancy/conformance'
import type {
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
 */
export function createAngularDriver(): RendererDriver {
  let engine: FormEngine | undefined
  let schema: ConformanceSchema | undefined
  let fixture: ComponentFixture<FormancyForm> | undefined
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
        capabilities: {
          now: () => Date.now(),
          today: () => new Date().toISOString().slice(0, 10),
          random: () => Math.random(),
        },
      })
      const view = await render(FormancyForm, {
        providers: [provideZonelessChangeDetection(), provideFormancy(engine)],
        inputs: { submitLabel: SUBMIT_LABEL },
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
      const { schema } = requireMounted()
      if (path === NEXT_COMMAND) {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
        await settle()
        return
      }
      if (path === BACK_COMMAND) {
        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        await settle()
        return
      }
      const separator = path.lastIndexOf(COMMAND_SEPARATOR)
      const target = path.slice(0, separator)
      const command = path.slice(separator + 1)
      const repeaterWire = target.replace(/\[\d+\]$/, '')
      const def = fieldAtPath(schema, repeaterWire)
      if (command === 'add') {
        fireEvent.click(screen.getByRole('button', { name: def?.addLabel ?? /^Add / }))
        await settle()
        return
      }
      if (command === 'remove') {
        const index = rowIndexOf(target) ?? 0
        const prefix = def?.removeLabel ?? 'Remove'
        const name = new RegExp(`^${escapeRegExp(prefix)} ${index + 1} of `)
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
        if (field.type === 'page' && (field.label ?? field.key) === name) return field.key
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
      fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
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

    async unmount() {
      TestBed.resetTestingModule()
      document.body.innerHTML = ''
      engine = undefined
      schema = undefined
      fixture = undefined
      lastOutcome = undefined
    },
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
