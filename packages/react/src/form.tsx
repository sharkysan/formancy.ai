import type { ComponentType, ReactNode } from 'react'
import { parsePath } from '@formancy/core'
import type { FieldDef, FieldType } from '@formancy/spec'
import { LayoutTree, placedPaths } from './layout.js'
import { useFormEngine } from './context.js'
import { useField } from './use-field.js'
import type { FieldBinding } from './use-field.js'
import { useRepeater } from './use-repeater.js'
import { useSubmit } from './use-submit.js'
import { useWizard } from './use-wizard.js'

/**
 * The component registry — theming mechanism number two. The schema decides
 * WHAT a field is; the registry decides what RENDERS it, with per-path entries
 * beating per-type entries beating the built-in defaults. A design system
 * replaces the entire visual layer by handing in a registry, without forking
 * anything.
 */
export interface FieldComponentProps {
  path: string
  label: string
}

export type FieldComponent = ComponentType<FieldComponentProps>

export interface Registry {
  byType?: Partial<Record<FieldType, FieldComponent>>
  byPath?: Record<string, FieldComponent>
}

export interface SubmitOutcome {
  ok: boolean
  errors: Record<string, string[]>
  /** The canonical value, present when accepted. */
  data?: unknown
}

export interface FormancyFormProps {
  /**
   * Display text per wire path (row fields by their template wire,
   * `items[].name`). A `label` on the model definition wins — that is how
   * fixture schemas carry text until the spec's i18n section lands; a missing
   * entry falls back to the wire path, which is at least honest.
   */
  labels?: Record<string, string>
  registry?: Registry
  /**
   * Render a named entry from the schema's `layouts` instead of model order —
   * `"web"`, `"print"`, whatever the document defines. Unknown or absent, the
   * form falls back to model order, because a mistyped layout name should not
   * produce an empty form.
   */
  layout?: string
  submitLabel?: string
  onSubmit?: (outcome: SubmitOutcome) => void
}

/**
 * Renders the whole form from the engine: one slot per field, resolved through
 * the registry. Slots subscribe individually, so a keystroke re-renders one
 * field and a visibility flip mounts or unmounts exactly the fields it hit.
 * A paged schema renders a stepper, one page at a time, navigation, and the
 * submit control on the last page — a failed submit navigates to the first
 * page with a problem instead of leaving the user on a clean review page
 * staring at a rejection.
 */
export function FormancyForm(props: FormancyFormProps) {
  const engine = useFormEngine()
  return engine.wizard() === undefined ? <FlatForm {...props} /> : <PagedForm {...props} />
}

function SubmitButton({ submitLabel, onSubmit, onFailedNavigate }: FormancyFormProps & { onFailedNavigate?: (page: number) => void }) {
  const engine = useFormEngine()
  const submit = useSubmit()
  return (
    <button
      type="button"
      data-formancy-part="submit"
      onClick={() => {
        const outcome = submit()
        if (!outcome.ok && onFailedNavigate !== undefined) {
          const firstInvalid = engine.firstInvalid()
          if (firstInvalid !== null) onFailedNavigate(engine.pageOf(parsePath(firstInvalid)))
        }
        onSubmit?.(
          outcome.ok
            ? { ok: true, errors: outcome.errors, data: engine.value() }
            : { ok: false, errors: outcome.errors },
        )
      }}
    >
      {submitLabel ?? 'Submit'}
    </button>
  )
}

function FlatForm(props: FormancyFormProps) {
  return (
    <>
      <FieldList {...props} />
      <SubmitButton {...props} />
    </>
  )
}

function PagedForm(props: FormancyFormProps) {
  const engine = useFormEngine()
  const wizard = useWizard()
  const pages = engine.pages()
  const lastPage = wizard.pageCount - 1

  return (
    <>
      <nav data-formancy-part="stepper" aria-label="Progress">
        <ol>
          {pages.map((page, index) => (
            <li key={page.key} aria-current={index === wizard.page ? 'step' : undefined}>
              {engine.text(page.def.label) ?? page.key}
            </li>
          ))}
        </ol>
      </nav>
      <FieldList {...props} page={wizard.page} />
      <div data-formancy-part="wizard-nav">
        {wizard.page > 0 ? (
          <button type="button" onClick={() => wizard.back()}>
            Back
          </button>
        ) : null}
        {wizard.page < lastPage ? (
          <button type="button" onClick={() => void wizard.next()}>
            Next
          </button>
        ) : (
          <SubmitButton {...props} onFailedNavigate={(page) => wizard.goTo(page)} />
        )}
      </div>
    </>
  )
}

function FieldList({ labels, registry, page, layout }: FormancyFormProps & { page?: number }) {
  const engine = useFormEngine()
  const repeaterWires = engine.repeaterPaths()
  const schema = engine.schema()

  const arrangement = schema.layouts?.find((candidate) => candidate.name === layout)
  if (layout !== undefined && arrangement !== undefined) {
    const placed = new Set(placedPaths(arrangement.nodes))

    return (
      <LayoutTree
        schema={schema}
        nodes={arrangement.nodes}
        locale={schema.i18n?.defaultLocale ?? ''}
        renderField={(path) => {
          if (repeaterWires.includes(path)) {
            return <RepeaterSection key={path} wire={path} labels={labels} registry={registry} />
          }
          return <FieldSlot key={path} path={path} fallbackLabel={labels?.[path]} registry={registry} />
        }}
      />
    )
    // A field the layout leaves out is not rendered. That is deliberate — a
    // print layout without the consent checkbox is doing its job — and it is
    // why `unreferencedPaths` exists in the spec for a builder to warn with.
    void placed
  }

  const inPage = (wire: string): boolean =>
    page === undefined || engine.pageOf(parsePath(wire)) === page

  // Row fields render inside their repeater's own section, never in the flat
  // list — a row needs its remove button and its position context.
  const staticWires = engine
    .fieldPaths()
    .filter((wire) => !repeaterWires.some((repeater) => wire.startsWith(`${repeater}[`)))

  return (
    <>
      {staticWires.filter(inPage).map((wire) => (
        <FieldSlot key={wire} path={wire} fallbackLabel={labels?.[wire]} registry={registry} />
      ))}
      {repeaterWires.filter(inPage).map((wire) => (
        <RepeaterSection key={wire} wire={wire} labels={labels} registry={registry} />
      ))}
    </>
  )
}

function FieldSlot({
  path,
  fallbackLabel,
  registry,
}: {
  path: string
  fallbackLabel?: string | undefined
  registry?: Registry | undefined
}) {
  const field = useField(path)

  // A hidden field leaves the DOM entirely: display:none would still ship the
  // markup, keep it in the accessibility tree's shadow, and leak its labels
  // to screen-reader "read all" passes.
  if (!field.visible) return null

  const Component =
    registry?.byPath?.[path] ?? registry?.byType?.[field.type] ?? DEFAULT_COMPONENTS[field.type]
  if (Component === null) return null

  const label = field.label ?? fallbackLabel ?? path
  return <Component path={path} label={label} />
}

function RepeaterSection({
  wire,
  labels,
  registry,
}: {
  wire: string
  labels?: Record<string, string> | undefined
  registry?: Registry | undefined
}) {
  const engine = useFormEngine()
  const repeater = useRepeater(wire)
  const def = engine.repeaters().find((candidate) => candidate.wire === wire)?.def
  const label = engine.text(def?.label) ?? labels?.[wire] ?? wire
  const addLabel = def?.addLabel ?? `Add ${label}`
  const removeLabel = def?.removeLabel ?? `Remove ${label}`

  const fallbackFor = (instanceWire: string): string | undefined => {
    const template = instanceWire.replace(/\[\d+\]/, '[]')
    return labels?.[template] ?? labels?.[instanceWire]
  }

  return (
    <fieldset data-formancy-part="repeater">
      <legend data-formancy-part="repeater-legend">{label}</legend>
      {repeater.rowIds.map((rowId, index) => (
        // Keyed by identity, not position: removing a row renumbers every row
        // after it, and an index key would make React reuse the wrong DOM
        // nodes — moving focus and animating the wrong element.
        <div data-formancy-part="row" key={rowId}>
          {engine
            .fieldPaths()
            .filter((candidate) => candidate.startsWith(`${wire}[${index}]`))
            .map((instanceWire) => (
              <FieldSlot
                key={instanceWire}
                path={instanceWire}
                fallbackLabel={fallbackFor(instanceWire)}
                registry={registry}
              />
            ))}
          {/* Position context in the NAME, so a screen-reader user knows which
              row this button kills without walking the tree. */}
          <button type="button" onClick={() => repeater.removeRow(index)}>
            {`${removeLabel} ${index + 1} of ${repeater.rowCount}`}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => repeater.addRow()}>
        {addLabel}
      </button>
    </fieldset>
  )
}

/** Shared unstyled shell: real label, control, error text as the describedby
 *  target. Zero CSS; `data-formancy-part` is the styling hook. */
function FieldShell({
  field,
  label,
  children,
}: {
  field: FieldBinding
  label: string
  children: ReactNode
}) {
  return (
    <div
      data-formancy-part="field"
      data-state={field.touched && field.errors.length > 0 ? 'invalid' : 'valid'}
    >
      <label data-formancy-part="label" {...field.labelProps}>
        {label}
      </label>
      {children}
      {field.touched && field.errors.length > 0 ? (
        <p data-formancy-part="error" {...field.errorProps}>
          {field.errors.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function TextField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell field={field} label={label}>
      <input
        type="text"
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

function TextareaField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell field={field} label={label}>
      <textarea
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

function NumberField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell field={field} label={label}>
      <input
        type="number"
        {...field.controlProps}
        value={typeof field.value === 'number' ? field.value : ''}
        onChange={(event) =>
          field.setValue(event.target.value === '' ? null : event.target.valueAsNumber)
        }
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

function CheckboxField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell field={field} label={label}>
      <input
        type="checkbox"
        {...field.controlProps}
        checked={field.value === true}
        onChange={(event) => field.setValue(event.target.checked)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

function DateField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell field={field} label={label}>
      <input
        type="date"
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

/**
 * Option labels resolved to strings, since a label may be a message reference.
 * Falling back to the stored value keeps an untranslated option selectable
 * rather than blank.
 */
function useResolvedOptions(field: { def: FieldDef }): Array<{ value: string; label: string }> {
  const engine = useFormEngine()
  return (field.def.options ?? []).map((option) => ({
    value: option.value,
    label: engine.text(option.label) ?? option.value,
  }))
}

function SelectField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  return (
    <FieldShell field={field} label={label}>
      {/* Setting `value` on the select works only because React applies it
          AFTER the option children render; a select's value property is
          settable once its options exist. Angular binds [selected] per option
          for the same reason — the explicit form of the same contract. */}
      <select
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        onBlur={() => field.touch()}
      >
        {/* The empty option is the unanswered state; without it the browser
            silently pre-selects the first real option, which the engine never
            heard about. */}
        <option value="" />
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

function RadioGroupField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  return (
    <fieldset
      data-formancy-part="field"
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
    >
      <legend data-formancy-part="label">{label}</legend>
      {options.map((option) => {
        const optionId = `${field.ids.control}:${option.value}`
        return (
          <span key={option.value} data-formancy-part="radio-option">
            <input
              type="radio"
              id={optionId}
              name={field.controlProps.name}
              value={option.value}
              checked={field.value === option.value}
              onChange={() => field.setValue(option.value)}
              onBlur={() => field.touch()}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </span>
        )
      })}
      {showError ? (
        <p data-formancy-part="error" {...field.errorProps}>
          {field.errors.join(', ')}
        </p>
      ) : null}
    </fieldset>
  )
}

/**
 * Text the reader sees that collects nothing — a heading, an explanation, a
 * notice.
 *
 * Not a `<label>`, because there is no control for one to label, and a label
 * pointing at nothing is a label a screen reader announces as an orphan. Not a
 * heading element either: the spec does not say what level it would be, and
 * guessing produces a document outline that skips levels.
 */
function StaticField({ label }: FieldComponentProps) {
  return <p data-formancy-part="static">{label}</p>
}

/**
 * The built-in unstyled components. `null` means the type renders nothing here:
 * a hidden field is carried in the submission and never shown, and the
 * container types are laid out by their own machinery rather than by a leaf
 * slot.
 */
const DEFAULT_COMPONENTS: Record<FieldType, FieldComponent | null> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  checkbox: CheckboxField,
  date: DateField,
  select: SelectField,
  radio: RadioGroupField,
  hidden: null,
  static: StaticField,
  group: null,
  page: null,
  repeater: null,
}
