import { useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { parsePath } from '@formancy/core'
import { applyRichCommand, datagridColumns, narrowOptionsByLabel } from '@formancy/spec'
import type { DataGridColumn, FieldDef, FieldType, RichCommand } from '@formancy/spec'
import { LayoutTree, placedPaths } from './layout.js'
import { useFormEngine } from './context.js'
import { useField } from './use-field.js'
import type { FieldBinding } from './use-field.js'
import { useRepeater } from './use-repeater.js'
import { useSubmit } from './use-submit.js'
import { useWizard } from './use-wizard.js'
import { RichText } from './rich-text.js'
import {
  useRichTextEditorFactory,
} from './rich-text-editor.js'
import type { RichTextEditorFactory, RichTextEditorHandle } from './rich-text-editor.js'
import { useScanner } from './scanning.js'
import { useSourcedOptions } from './use-sourced-options.js'
import { useUploader } from './uploads.js'
import type { StoredFile } from './uploads.js'

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

  // The grid, computed once per render and empty unless the widget asked for one.
  // `columns` without the widget stays inert on purpose: 0066 lets an author write the
  // arrangement before a renderer honours it, and a repeater that silently became a grid
  // because somebody sized its columns would be the opposite of that.
  const grid = def?.widget === 'datagrid'
  const declaredColumns = def?.columns ?? []
  const plan = grid ? datagridColumns(def, declaredColumns) : []

  // The ratios, as ONE custom property on the container rather than as
  // `grid-template-columns`. A property lays nothing out by itself, so a theme's
  // narrow-screen media query replaces its own declaration and wins rather than losing to
  // an inline one it cannot outrank. It also carries a value space no attribute can
  // enumerate: `width` is a `number` with `exclusiveMinimum: 0`, so 1.5 is legal and
  // nothing bounds it from above.
  //
  // Emitted only when an author sized something, so the theme's fallback is live code
  // rather than a branch nothing takes.
  const tracks = declaredColumns.some((column) => column.width !== undefined)
    ? plan
        .map(({ column }) => (column?.width === undefined ? '1fr' : `${String(column.width)}fr`))
        .join(' ')
    : undefined

  /** The leaves inside one row that belong to one column's child field.
   *
   *  Matched on a segment boundary rather than with a bare `startsWith`: a child called
   *  `name` must not swallow `nameOnCard`, and a grouped child owns everything under it.
   *  A column names a DIRECT CHILD, while `fieldPaths()` returns leaves, because a group
   *  child is flattened into the fields inside it. */
  const leavesOf = (index: number, key: string): string[] => {
    const prefix = `${wire}[${String(index)}].${key}`
    return engine
      .fieldPaths()
      .filter(
        (leaf) => leaf === prefix || leaf.startsWith(`${prefix}.`) || leaf.startsWith(`${prefix}[`),
      )
  }

  /** A column's visible heading: the author's shortening, else the child's own label,
   *  else the labels prop, else the key.
   *
   *  Visible text and NOTHING else -- never an `id` target, never an `aria-label`.
   *  Measured against the accessible-name implementation this repository installs: a
   *  column heading contributes nothing to the name of a control in its column, whether
   *  it is a `<th scope="col">` or a `headers=` target. So the heading cannot replace a
   *  cell's label, and pointing a control at it would only ADD the heading to the name --
   *  which is the failure 0066 separates `header` from `label` to prevent. */
  const headingOf = (entry: (typeof plan)[number]): string =>
    engine.text(entry.column?.header) ??
    engine.text(entry.child?.label) ??
    fallbackFor(`${wire}[0].${entry.key}`) ??
    entry.key

  /** A row's own controls, identical in both arrangements down to the names, because
   *  0068 put the row's position in those names and a grid does not change where a person
   *  is.
   *
   *  The text sits in its own element so a THEME can clip it and draw a mark instead,
   *  which is what a grid wants -- "Remove recipient 1 of 1" on three wrapped lines took
   *  more room than the answers beside it, measured in the playground. Clipped and never
   *  removed: `display: none` and `visibility: hidden` both compute the button's name to
   *  the empty string, and a button called nothing is worse than a wide one.
   *
   *  The renderer draws no mark of its own. An icon is appearance, appearance belongs to
   *  the consumer ([0004](../../../docs/decisions/0004-headless-core.md)), and a renderer
   *  that shipped a glyph would be choosing one for every design system at once. */
  const rowButtons = (index: number): ReactNode => (
    <>
      {/* Position context in the NAME, so a screen-reader user knows which
          row this button kills without walking the tree. */}
      <button type="button" data-formancy-part="row-remove" onClick={() => repeater.removeRow(index)}>
        <span data-formancy-part="row-action-text">
          {`${removeLabel} ${index + 1} of ${repeater.rowCount}`}
        </span>
      </button>
      {/* Reordering by button, which is the KEYBOARD route and therefore the
          primary one: WCAG 2.5.7 requires a non-drag equivalent for any drag, so
          a drag affordance can only ever be a second route to these.

          Position is in the name here too, and the name says where the row goes
          rather than which direction it travels.

          Absent at the ends rather than disabled. A disabled button is still in
          the tab order in some browsers and announces a control that does
          nothing; a row that cannot move up simply has no such button. */}
      {index > 0 ? (
        <button type="button" data-formancy-part="row-up" onClick={() => repeater.moveRow(index, index - 1)}>
          <span data-formancy-part="row-action-text">
            {`Move ${label} ${index + 1} of ${repeater.rowCount} up`}
          </span>
        </button>
      ) : null}
      {index < repeater.rowCount - 1 ? (
        <button type="button" data-formancy-part="row-down" onClick={() => repeater.moveRow(index, index + 1)}>
          <span data-formancy-part="row-action-text">
            {`Move ${label} ${index + 1} of ${repeater.rowCount} down`}
          </span>
        </button>
      ) : null}
    </>
  )

  /** One control in a row.
   *
   *  Keyed by the POSITIONAL WIRE, so every control in a row is remounted when the row
   *  moves and focus is lost on a reorder. Keying by the field's key within the row fixes
   *  that here, and was reverted to keep the two renderers identical: the same change in
   *  Angular lets it REUSE a component whose path is read once in ngOnInit, so after a
   *  removal it binds to the old wire and shows the wrong row's answer -- caught by a
   *  conformance fixture. One renderer keeping focus and the other not is the
   *  framework-specific divergence this architecture exists to prevent, so both wait for
   *  reactive path binding in Angular. */
  const slot = (instanceWire: string): ReactNode => (
    <FieldSlot
      key={instanceWire}
      path={instanceWire}
      fallbackLabel={fallbackFor(instanceWire)}
      registry={registry}
    />
  )

  const rows = repeater.rowIds.map((rowId, index) =>
    grid ? (
      // Keyed by identity, not position: removing a row renumbers every row after it, and
      // an index key would make React reuse the wrong DOM nodes.
      <div data-formancy-part="datagrid-row" key={rowId}>
        {plan.map((entry) => (
          // Always emitted, even when every field in it renders nothing. A rule that
          // hides one answer must not shift that row's remaining columns out of line
          // with the heading strip and with every other row -- which is the whole
          // reason this arrangement exists.
          <div
            data-formancy-part="datagrid-cell"
            key={entry.key}
            {...(entry.column?.align === undefined ? {} : { 'data-align': entry.column.align })}
          >
            {leavesOf(index, entry.key).map(slot)}
          </div>
        ))}
        {/* One cell for all of a row's buttons, because there are two on the first and
            last rows and three in between. A track whose cell count varied per row is
            exactly what a table cannot express without a cell that announces a blank. */}
        <div data-formancy-part="datagrid-actions">{rowButtons(index)}</div>
      </div>
    ) : (
      <div data-formancy-part="row" key={rowId}>
        {engine
          .fieldPaths()
          .filter((candidate) => candidate.startsWith(`${wire}[${String(index)}]`))
          .map(slot)}
        {rowButtons(index)}
      </div>
    ),
  )

  return (
    <fieldset data-formancy-part="repeater">
      <legend data-formancy-part="repeater-legend">{label}</legend>
      {grid ? (
        // A container inside the fieldset rather than the fieldset itself, so the legend
        // and the Add button do not become grid items.
        //
        // No role anywhere in here, and that is the decision rather than an omission.
        // `role="grid"` would take the arrow keys, which the controls in the cells
        // already own -- a `select` with `widget: "typeahead"` is legal in a row and
        // claims Up, Down, Home, End, Enter and Escape -- and it would replace twenty tab
        // stops with one. A role is not paint, which is the line 0065 draws.
        <div
          data-formancy-part="datagrid"
          data-columns={String(plan.length)}
          {...(tracks === undefined ? {} : { style: { '--fm-datagrid-columns': tracks } as CSSProperties })}
        >
          {/* Only once there is a row to head, and plain static text. A heading here
              names nothing, so a theme may delete it at phone width without changing what
              any control announces -- which is the property that makes the narrow-screen
              reflow possible at all. */}
          {repeater.rowCount > 0 ? (
            <div data-formancy-part="datagrid-head">
              {plan.map((entry) => (
                <span
                  data-formancy-part="datagrid-heading"
                  key={entry.key}
                  {...(entry.column?.align === undefined
                    ? {}
                    : { 'data-align': entry.column.align })}
                >
                  {headingOf(entry)}
                </span>
              ))}
            </div>
          ) : null}
          {rows}
        </div>
      ) : (
        rows
      )}
      <button type="button" onClick={() => repeater.addRow()}>
        {addLabel}
      </button>
    </fieldset>
  )
}

/** Shared unstyled shell: real label, control, error text as the describedby
 *  target. Zero CSS; `data-formancy-part` is the styling hook. */
function FieldShell({
  path,
  field,
  label,
  children,
}: {
  path: string
  field: FieldBinding
  label: string
  children: ReactNode
}) {
  return (
    <div
      data-formancy-part="field"
      // Inert here, and read by tools outside the renderer — the builder's
      // arrange surface needs to know which field an element on screen is.
      data-formancy-field-path={path}
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

/**
 * A single-line answer, and — with `widget: "scanner"` — a camera route to the same
 * string.
 *
 * The input is the control in both cases, never a second one beside it: typing is
 * the accessibility floor and the fallback at once, so it is what is always there
 * and the scan button is what is sometimes added. With no scanner supplied the
 * markup is the default control exactly, because a Scan button that opens nothing is
 * worse than no button ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 */
function TextField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const scan = useScanner()
  const [scanning, setScanning] = useState(false)
  /** A device failure, held here rather than in the field's errors. See below. */
  const [trouble, setTrouble] = useState<string | undefined>(undefined)

  /**
   * The ONE place a text field's answer is written, typed or scanned.
   *
   * Structural rather than careful: the parameter is a `string`, so there is no path
   * from the camera to `setValue` that could store something typing could not. That
   * is the line a widget may never cross — it changes how a field looks, never what
   * it collects ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
   */
  const commit = (text: string): void =>
    // `<input type="text">` runs the platform's value sanitiser on everything that reaches
    // it -- "strip newlines from the value", in HTML's value sanitization algorithm -- so a
    // typed or pasted answer can never hold CR or LF. A scanned code CAN: a Wi-Fi or vCard
    // payload is several lines. Applying the control's own rule here is what makes a scanned
    // answer byte-identical to a typed one rather than merely similar, which is the line a
    // widget may not cross
    // ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
    //
    // Not a second validator -- `pattern` stays the engine's -- and not taste: jsdom does
    // not implement the sanitiser either, so nothing here notices unless it is asserted.
    field.setValue(text.replace(/[\r\n]/g, ''))

  const read = async (): Promise<void> => {
    // Re-entrancy, which `disabled` used to prevent: a second press while a scan is in
    // flight is ignored rather than opening a second camera session.
    if (scan === undefined || scanning) return
    setScanning(true)
    setTrouble(undefined)
    try {
      const text = await scan({ label, path })
      // Nobody scanned anything: the sheet was closed, or they changed their mind.
      // Not a failure, and an apology in a live region for a decision somebody made
      // on purpose is noise.
      if (text === null) return
      if (typeof text !== 'string') {
        // A host written in plain JavaScript can resolve with anything. Reported as
        // the device failure it is, rather than stored — an object in a text field
        // is exactly what `commit` exists to make impossible.
        setTrouble(
          'Scanning did not work: the scanner did not return text. Type the value instead.',
        )
        return
      }
      // Stored as typed, THEN touched — so a value the field's `pattern` refuses
      // shows the engine's own error rather than being dropped. Dropping it would
      // discard the only record of what the camera read and leave the field looking
      // empty, which is the worse of the two failures by some distance.
      commit(text)
      field.touch()
    } catch (error) {
      setTrouble(
        `Scanning did not work: ${
          error instanceof Error ? error.message : String(error)
        }. Type the value instead.`,
      )
    } finally {
      setScanning(false)
    }
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="text"
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => field.touch()}
      />
      {field.def.widget === 'scanner' && scan !== undefined ? (
        <>
          <button
            type="button"
            data-formancy-part="scanner-button"
            // Disabled only when the FIELD is. Disabling the button somebody just pressed
            // blurs it, and the browser then resets focus to `<body>` — so a keyboard user
            // who presses Scan is returned to the top of the document, and the status line
            // tells them to type the value instead into a field they now have to find again.
            //
            // Busy is said with `aria-busy`, which changes nothing about focus, and the guard
            // in `read` does what `disabled` was doing. Not testable here: jsdom does not
            // blur a focused element that becomes disabled, which is exactly why this was
            // written the other way round first.
            disabled={field.disabled}
            aria-busy={scanning ? true : undefined}
            onClick={() => {
              void read()
            }}
          >
            {/* The word is the visible label and the field's name completes the
                accessible one, so three scannable fields on a page do not offer
                three buttons called "Scan" — and the visible text is still
                contained in the accessible name (WCAG 2.5.3). */}
            Scan <span data-formancy-part="visually-hidden">{label}</span>
          </button>
          {/* The camera's own progress and its failures, in this field's polite
              region. NOT the error region: that one is the control's describedby
              target, it holds the engine's verdicts, and a refused permission put
              there would describe a hardware problem as a wrong answer. Same shape
              as the file field's status line, for the same reason. */}
          <p role="status" data-formancy-part="scanner-status">
            {scanning ? 'Scanning…' : (trouble ?? '')}
          </p>
        </>
      ) : null}
    </FieldShell>
  )
}

function TextareaField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
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
    <FieldShell path={path} field={field} label={label}>
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
    <FieldShell path={path} field={field} label={label}>
      <input
        type="checkbox"
        {...field.controlProps}
        /* `widget: "toggle"` is a part name and NOT `role="switch"`. ARIA's switch
           means a control that takes effect when you operate it, and a form field
           sets a value submitted later or never — so announcing "switch" describes
           it incorrectly to the people who rely on the description. A role is also
           not paint: changing it would make this the first widget to change what a
           control claims to be, which is the line the widget mechanism exists to
           hold. The switch is CSS, and conformance keeps finding this by role
           `checkbox` either way. */
        {...(field.def.widget === 'toggle' ? { 'data-formancy-part': 'toggle' } : {})}
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
    <FieldShell path={path} field={field} label={label}>
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
 * A time of day, as `HH:MM`.
 *
 * `<input type="time">` gives the platform's own picker, its own keyboard handling
 * and its own locale display — a 12-hour clock where the reader expects one — while
 * its `value` is always `HH:MM` on a 24-hour clock. That is exactly the split the
 * format wants: the reader sees their convention, the answer records one canonical
 * shape.
 *
 * `step` is not set, so the browser offers no seconds. A time answer has none, and a
 * control offering a precision the format discards is a control that loses what
 * somebody typed.
 */
function TimeField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="time"
        {...field.controlProps}
        /* Bounds are handed to the browser as well as checked by the engine. The
           engine's check is the truth — it runs again on the server — and this is
           what lets the platform grey out what it will not accept, which is a better
           experience than a message after the fact. */
        {...(typeof field.def.earliest === 'string' ? { min: field.def.earliest } : {})}
        {...(typeof field.def.latest === 'string' ? { max: field.def.latest } : {})}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value === '' ? null : event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

/**
 * An instant, stored as `YYYY-MM-DDTHH:MM:SSZ`.
 *
 * `<input type="datetime-local">` because there is no zoned datetime input in any
 * browser — so the control shows the reader a local wall clock and this converts.
 * The conversion is the whole reason this component exists rather than reusing
 * `DateField`:
 *
 * - **In:** the control gives `YYYY-MM-DDTHH:MM` in the reader's own zone. `new
 *   Date(local).toISOString()` interprets a zoneless string as local time, which is
 *   what is wanted here and is exactly what `bindTimestamp` refuses for a stored
 *   value — the difference is that the reader's zone is known at the moment they
 *   type, and is not knowable later.
 * - **Out:** the stored instant is rendered back into local time for the control,
 *   sliced to minutes because the input rejects a seconds component it was not asked
 *   for.
 *
 * Seconds are therefore always `00` in an answer a person typed. The format keeps
 * them because a machine-supplied answer has them and a fixed width is what makes
 * ordering work.
 */
function DateTimeField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const stored = typeof field.value === 'string' ? field.value : ''
  const asLocal = (): string => {
    if (stored === '') return ''
    const instant = new Date(stored)
    if (Number.isNaN(instant.getTime())) return ''
    // Local parts, not `toISOString()`: that would show UTC in a control the
    // browser labels as local, so the reader would see an hour they did not type.
    const pad = (part: number): string => String(part).padStart(2, '0')
    return (
      `${String(instant.getFullYear())}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
      `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
    )
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="datetime-local"
        {...field.controlProps}
        value={asLocal()}
        onChange={(event) => {
          const local = event.target.value
          if (local === '') {
            field.setValue(null)
            return
          }
          const instant = new Date(local)
          // A control can hand back something unparseable mid-edit. Writing null
          // rather than a malformed string keeps the stored answer always either
          // empty or canonical, which is what the engine's shape check assumes.
          field.setValue(
            Number.isNaN(instant.getTime())
              ? null
              : `${instant.toISOString().slice(0, 19)}Z`,
          )
        }}
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
  // The query the plain control searches with is the empty one: a native select has
  // nothing to type into, so it offers whatever the source returns for "everything",
  // capped. A source with more rows than that is a source whose field wants the
  // typeahead widget, and the status region says how many were left out.
  // One hook, unconditionally: it hands back the document's own options when the
  // field names no source, so there is no branch above a hook to reorder React's
  // list the moment the builder sets one on a live document.
  const sourced = useSourcedOptions(field, '', field.def.widget !== 'typeahead')
  const options = sourced.options
  // Every hook runs before the branch on purpose: the builder can set a widget on
  // a live document, and a branch above a hook would reorder React's hook list
  // the moment it did.

  // The document names a source this deployment does not have. Unlike a missing
  // scanner this costs the whole field -- a select with no options collects nothing
  // -- so it says so where the chooser would be, exactly as the file field does.
  //
  // BEFORE the widget, and the order is the fix: dispatching to the typeahead first
  // made this message unreachable for the very widget the feature was built for. What
  // somebody got instead was a working-looking combobox that returned nothing and
  // announced "No options match" -- which says the list has no such row, when the
  // truth is that there is no list.
  if (sourced.remote?.unavailable === true) {
    return (
      <FieldShell path={path} field={field} label={label}>
        <p data-formancy-part="options-unavailable">
          {`This field's answers come from "${field.def.optionsSource ?? ''}", which this application has not provided.`}
        </p>
      </FieldShell>
    )
  }

  if (field.def.widget === 'typeahead') {
    return <TypeaheadSelectField path={path} label={label} field={field} />
  }

  return (
    <FieldShell path={path} field={field} label={label}>
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
      {/* Only a sourced select has anything to say: how many rows were left out, or
          that the source could not be reached. Never the error region, which carries
          the engine's verdict — a source being down is not a wrong answer. */}
      {sourced.remote === null ? null : (
        <p role="status" data-formancy-part="select-status">
          {sourced.remote.status}
        </p>
      )}
    </FieldShell>
  )
}

/**
 * `widget: "typeahead"` - the same select, narrowed by typing.
 *
 * An ARIA 1.2 editable combobox over a listbox popup: a text box with
 * `role="combobox"` and a `<ul role="listbox">` of `<li role="option">`. DOM focus
 * never leaves the text box, so the arrowed-over option is named by
 * `aria-activedescendant` - which is the only thing that says where somebody is
 * when what they are moving through does not hold focus.
 *
 * **The list element exists while the popup is collapsed.** `aria-expanded` and
 * `aria-controls` are required properties of the role, and an `aria-controls`
 * pointing at an element that is not there is an unresolvable IDREF - so the
 * listbox is rendered and `hidden` rather than mounted when it opens.
 *
 * `aria-autocomplete="list"`, never `"both"`: nothing is ever written into the box
 * on the person's behalf, and `"both"` announces an inline completion that does
 * not exist. No `aria-haspopup`: `listbox` is the role's implicit popup, so the
 * attribute either repeats it or lies.
 *
 * `aria-selected` is on the CHOSEN option and on nothing else. Following the arrow
 * keys with it - the commonest defect in this pattern - tells a screen reader the
 * answer changed every time somebody pressed Down to read the next row.
 *
 * **It cannot store what somebody typed.** `setValue` is reached from exactly two
 * places here, with an option's own value or with `null`, and the text goes nowhere
 * but the filter. That is what makes
 * [0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)
 * structural rather than remembered: there is no path from this input to a stored
 * string a plain select could not have produced. So leaving the field with a query
 * that matches nothing stores nothing, and the box goes back to showing the answer.
 *
 * `null` is the other half of that: a select's empty first option means
 * un-answering is always available, and a widget may not take it away. Clearing the
 * box and leaving clears the answer.
 */
/**
 * What the status region is saying, as a word a theme can select on.
 *
 * Not the text: a theme that keyed off English prose would break in every other
 * language the form is offered in.
 */
function statusState({
  sourced,
  open,
  matches,
}: {
  sourced: { remote: { busy: boolean; status: string } | null }
  open: boolean
  matches: number
}): string | undefined {
  if (sourced.remote === null) return open && matches === 0 ? 'empty' : undefined
  if (sourced.remote.busy) return 'busy'
  if (sourced.remote.status.startsWith('The options could not')) return 'failed'
  if (sourced.remote.status !== '') return 'hint'
  return open && matches === 0 ? 'empty' : undefined
}

function TypeaheadSelectField({
  path,
  label,
  field,
}: FieldComponentProps & {
  field: FieldBinding
}) {
  /**
   * What is in the box while somebody types, or null when the box is simply
   * showing the answer.
   *
   * Two states rather than one string, because "empty because they cleared it"
   * and "empty because there is no answer" are different facts, and only the
   * first clears the answer on the way out.
   */
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  /** The arrowed-over option by VALUE, not by index: the filtered list changes on
   *  every keystroke and an index would point at a different row after one. */
  const [activeValue, setActiveValue] = useState<string | null>(null)

  // The options, from the document or from the deployment. The query goes in so a
  // source is asked what somebody is looking for rather than for everything.
  const sourced = useSourcedOptions(field, query ?? '')
  const options = sourced.options

  const chosen = options.find((option) => option.value === field.value)
  // A source is the authority on what matches: it was handed the query, and
  // re-folding its rows here would drop ones it matched on data the person cannot
  // see. A host that wants fetch-once-filter-locally composes `narrowOptionsByLabel`
  // in its own resolver, which is why that function lives in `@formancy/spec`.
  const matches =
    sourced.remote === null ? narrowOptionsByLabel(options, query ?? '') : options
  /** Collapsed whenever there is nothing on the screen, so `aria-expanded` never
   *  claims a popup a person cannot see. */
  const expanded = open && matches.length > 0
  const activeIndex = matches.findIndex((option) => option.value === activeValue)
  const activeId =
    expanded && activeIndex !== -1 ? optionDomId(field, matches[activeIndex]!.value) : undefined
  const listboxId = `${field.ids.control}:listbox`

  const choose = (value: string): void => {
    field.setValue(value)
    setQuery(null)
    setOpen(false)
    setActiveValue(null)
  }

  const moveActive = (delta: number): void => {
    if (matches.length === 0) return
    const from = activeIndex === -1 ? (delta > 0 ? -1 : matches.length) : activeIndex
    // Clamped, not wrapped: Down means further down the list, and a list that
    // jumps back to the top moves somebody past the end without saying so.
    const next = Math.min(Math.max(from + delta, 0), matches.length - 1)
    setActiveValue(matches[next]!.value)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        // Opens ON the answer when there is one, so Down then Enter cannot
        // quietly change an answer somebody only wanted to look at.
        const fallback = event.key === 'ArrowDown' ? matches[0] : matches[matches.length - 1]
        setActiveValue(chosen?.value ?? fallback?.value ?? null)
        return
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if ((event.key === 'Home' || event.key === 'End') && expanded) {
      // The popup's keys while it is open. Left to the caret, a long list is
      // reachable only by holding Down.
      event.preventDefault()
      setActiveValue((event.key === 'Home' ? matches[0]! : matches[matches.length - 1]!).value)
      return
    }
    if (event.key === 'Enter') {
      // Only while the list is showing. Otherwise Enter belongs to the form, and
      // a control that swallowed it would break submitting from the keyboard.
      if (!expanded) return
      event.preventDefault()
      if (activeIndex === -1) {
        setOpen(false)
        return
      }
      choose(matches[activeIndex]!.value)
      return
    }
    if (event.key === 'Escape') {
      if (!open && query === null) return
      event.preventDefault()
      // "Never mind about this list", not "delete what I chose earlier": the
      // query is abandoned and the ANSWER is untouched.
      setOpen(false)
      setActiveValue(null)
      setQuery(null)
    }
  }

  const onBlur = (): void => {
    setOpen(false)
    setActiveValue(null)
    if (query !== null) {
      // An emptied box is the empty option, and the only route to null. Anything
      // else typed is abandoned - it was never an answer.
      if (query.trim() === '') field.setValue(null)
      setQuery(null)
    }
    field.touch()
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      {/* The popup's containing block, and the reason it is an element rather than
          nothing at all.

          The popup was absolutely positioned with `top: auto`, on the reasoning that it
          would then land at its STATIC position -- where it would have sat in the flow,
          directly under the box. That holds inside a block container and NOT inside a
          grid or flex one, and every theme lays a field out with `display: grid`. For an
          absolutely positioned child of a grid container the static position is the
          container's own content-box origin, so the list opened over its own label and
          box rather than under them. Measured in the playground before the fix: the
          field's top edge was 457px, an in-flow child would have sat at 537px, and the
          popup sat at 459px.

          So the popup is given a containing block that wraps the control and nothing
          else, and every theme positions it against that explicitly. The status region
          stays OUTSIDE it, because it is a row of the field's grid exactly as the error
          region is. */}
      <div data-formancy-part="typeahead-anchor">
        <input
          type="text"
          role="combobox"
          {...field.controlProps}
          data-formancy-part="typeahead"
          // The browser's own suggestion list would sit over this one. This is not
          // the HTML autofill token WCAG 1.3.5 asks for: that is a separate thing
          // the spec has deliberately not spent the word on yet.
          autoComplete="off"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(sourced.remote?.busy === true
            ? // Busy, never disabled: disabling the element somebody just typed into
              // blurs it and the browser resets focus to the document body -- the same
              // reason the scanner's button stays enabled while a scan is in flight.
              { 'aria-busy': true }
            : {})}
          {...(activeId === undefined ? {} : { 'aria-activedescendant': activeId })}
          value={query ?? chosen?.label ?? ''}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            // Nothing is active on a keystroke: aria-activedescendant is ABSENT
            // rather than pointing at a row the person has not moved to.
            setActiveValue(null)
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {/* Named, because `listbox` is one of the roles whose accessible name is
            required -- `aria-query`'s `listboxRole.accessibleNameRequired` is true.
            axe in jsdom does NOT report its absence, measured by removing this line
            and watching the audit below stay green, so the case that holds it in
            place is a query by role AND name rather than the auditor.

            Not the field's own name: two elements answering to the same accessible
            name make "the control called X" ambiguous for every query that uses it,
            starting with the conformance driver's own. */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          data-formancy-part="typeahead-listbox"
          hidden={!expanded}
        >
          {matches.map((option) => (
            <li
              key={option.value}
              id={optionDomId(field, option.value)}
              role="option"
              data-formancy-part="typeahead-option"
              data-active={option.value === activeValue ? 'true' : undefined}
              {...(chosen?.value === option.value ? { 'aria-selected': true } : {})}
              // Keeps DOM focus in the text box, which is the pattern's whole
              // premise; without it the blur handler runs before the click and the
              // click lands on a list that has already gone.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
      {/* Present from the start and empty until there is something to say: a live
          region created at the moment it gets its text is one several screen
          readers never announce.

          ONE region, and never the error region. A source being down is not a wrong
          answer, and the error region is the control's `aria-describedby` target
          carrying the engine's verdict — the same line the scanner draws.

          A source's own words win over "no options match": while a request is in
          flight, "nothing matched" is not yet true. */}
      <p
        role="status"
        data-formancy-part="typeahead-status"
        {...(statusState({ sourced, open, matches: matches.length }) === undefined
          ? {}
          : { 'data-state': statusState({ sourced, open, matches: matches.length }) })}
      >
        {sourced.remote !== null && sourced.remote.status !== ''
          ? sourced.remote.status
          : open && matches.length === 0 && sourced.remote?.busy !== true
            ? 'No options match'
            : ''}
      </p>
    </FieldShell>
  )
}

/** One option's element id, in the shape the radio group already uses, so a
 *  reader of the DOM meets one convention rather than two. */
function optionDomId(field: FieldBinding, value: string): string {
  return `${field.ids.control}:option:${value}`
}

/**
 * How a grouped field says it is required.
 *
 * A real element rather than an attribute, because the attribute that would
 * mean this — `aria-required` — is not supported on `role="group"`. The
 * engine puts this element's id into the group's `aria-describedby`, so it is
 * announced after the legend; rendering it is all a renderer has to do.
 *
 * Visible as well as announced: WCAG 1.4.1 means a requirement carried only by
 * a red asterisk is a requirement some people cannot perceive.
 */
function RequiredHint({ field }: { field: ReturnType<typeof useField> }) {
  if (!field.required) return null
  return (
    <span data-formancy-part="required-hint" id={field.props.hint.id}>
      required
    </span>
  )
}

function RadioGroupField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  return (
    <fieldset
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
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
 * Several answers from a list, every option visible at once.
 *
 * A `fieldset` with a `legend`, exactly like the radio group, because the
 * relationship is the same one: several controls that answer a single
 * question. What differs is only that more than one may be chosen, which is
 * `type="checkbox"` and an array — not a different structure and not a
 * different way of being announced.
 *
 * Requiring "at least one" is a property of the QUESTION, not of any one box,
 * so it belongs to the group — but not as `aria-required`, which
 * `role="group"` does not support and assistive technology therefore ignores.
 * It is announced through the group's description instead, which the engine
 * composes. Putting it on every box would announce each one as required,
 * which is the opposite of what it means.
 */
function SelectBoxesField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const options = useResolvedOptions(field)
  const showError = field.touched && field.errors.length > 0
  const chosen = Array.isArray(field.value) ? (field.value as unknown[]) : []

  const toggle = (value: string, on: boolean): void => {
    // Rebuilt in the options' own order rather than in the order they were
    // ticked, so two people choosing the same answers store the same array and
    // a diff of two submissions means something.
    const next = options
      .map((option) => option.value)
      .filter((candidate) => (candidate === value ? on : chosen.includes(candidate)))
    field.setValue(next)
  }

  return (
    <fieldset
      data-formancy-part="field"
      data-formancy-field-path={path}
      data-state={showError ? 'invalid' : 'valid'}
      aria-describedby={field.controlProps['aria-describedby']}
    >
      <legend data-formancy-part="label">{label}</legend>
      <RequiredHint field={field} />
      {options.map((option) => {
        const optionId = `${field.ids.control}:${option.value}`
        return (
          <span key={option.value} data-formancy-part="checkbox-option">
            <input
              type="checkbox"
              id={optionId}
              name={field.controlProps.name}
              value={option.value}
              checked={chosen.includes(option.value)}
              disabled={field.disabled}
              onChange={(event) => toggle(option.value, event.target.checked)}
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
 * Formatted text, written as the restricted markup the spec defines.
 *
 * A textarea, not a contenteditable surface. That is a deliberate v1 cut and
 * not laziness: a WYSIWYG editor is a large accessibility surface of its own
 * — keyboard shortcuts, an announced selection model, focus management
 * inside a rich region — and shipping a half-built one is worse than
 * shipping a textarea that works with every assistive technology already.
 *
 * What the reader types is never treated as markup by anything. It is parsed
 * into a typed tree and rendered as elements, so there is no path from an
 * answer to `innerHTML` and no sanitiser to keep correct forever.
 */
/**
 * The rich text toolbar.
 *
 * A row of buttons over a textarea, not a contenteditable surface. That is the
 * deliberate choice — see `@formancy/spec`'s `richtext-edit` for why — and
 * it is what makes this editor cheap to make correct: the control is a plain
 * `<textarea>` that every assistive technology already knows, and the buttons
 * are ordinary buttons that do string arithmetic.
 *
 * The ARIA toolbar pattern, which means ONE tab stop for the whole row and
 * arrow keys within it. Five buttons that each take a tab press would put five
 * stops between a keyboard user and the box they came to type in.
 */
function RichTextToolbar({
  disabled,
  label,
  onCommand,
}: {
  disabled: boolean
  label: ReactNode
  onCommand: (command: RichCommand, href?: string) => void
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const [active, setActive] = useState(0)

  const commands: ReadonlyArray<{ command: RichCommand; name: string; glyph: string }> = [
    { command: 'strong', name: 'Bold', glyph: 'B' },
    { command: 'emphasis', name: 'Italic', glyph: 'I' },
    { command: 'link', name: 'Link', glyph: '↗' },
    { command: 'bulletList', name: 'Bulleted list', glyph: '•' },
    { command: 'orderedList', name: 'Numbered list', glyph: '1.' },
  ]

  const move = (to: number): void => {
    const index = (to + commands.length) % commands.length
    setActive(index)
    buttons.current[index]?.focus()
  }

  return (
    <div
      role="toolbar"
      // Named with the field, because a form may have several of these and
      // "toolbar" five times tells a screen-reader user nothing about which
      // question they are formatting the answer to.
      aria-label={typeof label === 'string' ? `Formatting for ${label}` : 'Formatting'}
      data-formancy-part="richtext-toolbar"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          move(active + 1)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          move(active - 1)
        } else if (event.key === 'Home') {
          event.preventDefault()
          move(0)
        } else if (event.key === 'End') {
          event.preventDefault()
          move(commands.length - 1)
        }
      }}
    >
      {commands.map((entry, index) => (
        <button
          key={entry.command}
          ref={(element) => {
            buttons.current[index] = element
          }}
          type="button"
          disabled={disabled}
          // The roving tabindex: one stop for the row, arrows within it.
          tabIndex={index === active ? 0 : -1}
          data-formancy-part="richtext-button"
          onFocus={() => setActive(index)}
          onClick={() => {
            // A link needs an address, and a prompt is the honest version of
            // asking for one without building a dialog this package would
            // then own the accessibility of. A host wanting its own can
            // replace the whole field through the component registry.
            if (entry.command === 'link') {
              const href = window.prompt('Address for the link')
              if (href === null || href === '') return
              onCommand('link', href)
              return
            }
            onCommand(entry.command)
          }}
        >
          {/* The glyph is decoration; the button's name is the word. */}
          <span aria-hidden="true">{entry.glyph}</span>
          <span data-formancy-part="visually-hidden">{entry.name}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The host's editor, mounted over the same value the textarea would have edited.
 *
 * Mounted once and fed afterwards, rather than re-created when the value
 * changes: a contenteditable rebuilt on every keystroke loses the caret, the
 * selection and the undo stack, which is the difference between an editor and a
 * box that fights you.
 *
 * What crosses the boundary is the stored grammar in both directions, never
 * markup ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 */
function MountedRichText({
  field,
  value,
  make,
  onReady,
}: {
  field: ReturnType<typeof useField>
  value: string
  make: RichTextEditorFactory
  onReady: (handle: RichTextEditorHandle | undefined) => void
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const handle = useRef<RichTextEditorHandle | undefined>(undefined)
  // The value at mount time, read through a ref so the mount effect does not
  // depend on it and therefore does not re-run when it changes.
  const opening = useRef(value)
  const commit = useRef(field.setValue)
  commit.current = field.setValue

  useEffect(() => {
    const element = host.current
    if (element === null) return undefined

    const editor = make({
      element,
      value: opening.current,
      onChange: (next) => commit.current(next),
      editable: field.disabled !== true,
      // The engine owns the ids and the describedby composition, so they are
      // passed in rather than invented here. `aria-labelledby` rather than a
      // `<label for>`: the surface is a div, and `for` does not reach one.
      attributes: {
        ...(field.controlProps['aria-describedby'] === undefined
          ? {}
          : { 'aria-describedby': field.controlProps['aria-describedby'] }),
        ...(field.controlProps['aria-invalid'] === undefined
          ? {}
          : { 'aria-invalid': 'true' }),
        ...(field.controlProps['aria-required'] === undefined
          ? {}
          : { 'aria-required': 'true' }),
        'aria-labelledby': field.labelProps.id,
        id: field.controlProps.id,
        // The editing surface is a CHILD of the mount point, so it is the
        // element a theme has to style. Named here rather than left as the
        // editor library's own class, so a theme is not coupled to TipTap.
        'data-formancy-part': 'richtext-surface',
      },
    })

    handle.current = editor
    onReady(editor)
    return () => {
      editor.destroy()
      handle.current = undefined
      onReady(undefined)
    }
    // Mount once. Everything that changes afterwards is pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make])


  useEffect(() => {
    const editor = handle.current
    if (editor === undefined) return
    // Only when the form changed the value from somewhere else — a calculation,
    // a draft being resumed, a reset. Comparing first is what stops the editor
    // resetting its own caret on every keystroke it just reported.
    if (editor.value() === value) return

    // And never while the person is in the editor.
    //
    // Without this the editor reverts its own change. Pressing Bold updates the
    // document, reports the new answer, and React re-renders — but for one
    // render `value` is still the answer from BEFORE the command. That render
    // reaches here, sees a difference, and pushes the stale answer back, which
    // un-bolds the word and then reports THAT. Observed in the playground: the
    // stored value went to `**hello**` and back to `hello` on its own.
    //
    // A value arriving from elsewhere while somebody is typing is rare; losing
    // what they just did is not recoverable. So the sync waits for them to leave,
    // and the comparison above catches it then.
    if (host.current?.contains(document.activeElement) === true) return

    editor.setValue(value)
  }, [value])

  return (
    <div
      data-formancy-part="richtext-editor"
      ref={host}
      onBlur={() => field.touch()}
    />
  )
}

function RichTextField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const value = typeof field.value === 'string' ? field.value : ''
  const box = useRef<HTMLTextAreaElement | null>(null)
  const make = useRichTextEditorFactory()
  // State rather than a ref: the toolbar has to re-render once the editor
  // exists, or its buttons are wired to nothing on the first paint.
  const [editor, setEditor] = useState<RichTextEditorHandle | undefined>(undefined)

  /**
   * Run a toolbar command against the live selection and put the caret back.
   *
   * The selection is restored in an effect-free way {@link queueMicrotask}
   * would not guarantee: React has to have written the new value first, so
   * the box is updated on the next frame rather than immediately. An editor
   * that drops the caret to the end after every button is one nobody can use
   * for a second word.
   */
  const run = (command: RichCommand, href?: string): void => {
    const element = box.current
    if (element === null) return

    const next = applyRichCommand(
      command,
      { value, start: element.selectionStart, end: element.selectionEnd },
      href === undefined ? {} : { href },
    )
    field.setValue(next.value)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.start, next.end)
    })
  }

  if (make !== undefined) {
    // The toolbar stays. An editor library brings keyboard shortcuts and no
    // toolbar UI, so leaving ours out made Bold reachable by Ctrl+B and by no
    // visible control — worse than the textarea it replaced. One toolbar drives
    // either surface, over the same `RichCommand` values, so the two cannot come
    // to offer different things.
    //
    // No preview, though: the surface IS the preview, which is the whole reason
    // somebody wanted this.
    return (
      <FieldShell path={path} field={field} label={label}>
        <RichTextToolbar
          disabled={field.disabled}
          label={label}
          onCommand={(command, href) => editor?.run(command, href)}
        />
        <MountedRichText field={field} value={value} make={make} onReady={setEditor} />
      </FieldShell>
    )
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <RichTextToolbar
        disabled={field.disabled}
        label={label}
        onCommand={run}
      />
      <textarea
        {...field.controlProps}
        ref={box}
        rows={5}
        value={value}
        onKeyDown={(event) => {
          // The two shortcuts every editor has. Nothing else is bound: a
          // surprise binding in a form field is worse than no binding.
          if (!(event.ctrlKey || event.metaKey)) return
          const command =
            event.key.toLowerCase() === 'b'
              ? 'strong'
              : event.key.toLowerCase() === 'i'
                ? 'emphasis'
                : undefined
          if (command === undefined) return
          event.preventDefault()
          run(command)
        }}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
      {/* What the stored answer will look like, from the same parser the form
          that displays it will use. Not decoration: the grammar is small
          enough that a preview is how somebody learns it. */}
      <div data-formancy-part="richtext-preview" aria-live="off">
        <RichText source={value} />
      </div>
    </FieldShell>
  )
}

/**
 * Attached files.
 *
 * The control picks files; something else uploads them and reports back what
 * was stored. That split is the whole design: this package has no opinion
 * about where bytes go, which is what lets the same field work against local
 * disk, S3 or a customer's own service.
 *
 * Without an uploader the field is read-only and says so, rather than
 * pretending to accept a file it has nowhere to put.
 */
function FileField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const upload = useUploader()
  const files = Array.isArray(field.value) ? (field.value as StoredFile[]) : []
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [over, setOver] = useState(false)
  /**
   * Attachments taken out of the answer but not yet forgotten.
   *
   * Held with the position they came from, so undoing puts a file BACK where it
   * was rather than on the end — the order matters to somebody who numbered
   * their attachments in a covering note.
   */
  const [removed, setRemoved] = useState<ReadonlyArray<{ at: number; file: StoredFile }>>([])

  const accept = field.def.accept
  const multiple = field.def.maxItems === undefined || field.def.maxItems > 1

  const onPick = async (picked: FileList | null): Promise<void> => {
    if (picked === null || picked.length === 0 || upload === undefined) return
    setBusy(true)
    setFailure(undefined)

    // Each file succeeds or fails on its own.
    //
    // The first version collected them into an array and set the value once, so
    // a throw on the third of five discarded the two that had ALREADY uploaded:
    // their bytes were in storage, the submission never mentioned them, the
    // collector reclaimed them within the day, and the person was told the
    // upload failed when half of it had not. Whose fault the failure is does not
    // change who loses the file.
    const uploaded: StoredFile[] = []
    const refused: string[] = []

    for (const file of Array.from(picked)) {
      try {
        uploaded.push(await upload(file))
      } catch (error) {
        refused.push(`${file.name} (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    // Recorded before the failure is reported, so nothing that reached storage
    // is left unclaimed while somebody reads the message.
    if (uploaded.length > 0) field.setValue([...files, ...uploaded])

    if (refused.length > 0) {
      // Named, because "the upload failed" over a list of five attachments does
      // not say which one to try again.
      setFailure(
        refused.length === 1
          ? `${refused[0]!} was not attached.`
          : `${String(refused.length)} files were not attached: ${refused.join(', ')}.`,
      )
    }

    setBusy(false)
    field.touch()
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      {upload === undefined ? (
        <p data-formancy-part="file-unavailable">
          This form cannot accept files here, because no upload destination has been configured.
        </p>
      ) : (
        /*
         * The picker inside a drop target, not instead of one.
         *
         * Dropping is a pointer gesture with no keyboard equivalent, so it can
         * only ever be a SECOND route (WCAG 2.1.1). The input stays exactly as
         * it was and keeps the field's label and ARIA wiring; the region around
         * it accepts a drop and hands the files to the same function. Two routes,
         * one implementation.
         */
        <div
          data-formancy-part="file-dropzone"
          {...(over ? { 'data-state': 'over' } : {})}
          onDragOver={(event) => {
            // Without preventDefault the browser navigates to the file instead
            // of letting the page have it, which looks like the form vanishing.
            event.preventDefault()
            if (field.disabled || busy) return
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            if (field.disabled || busy) return
            void onPick(event.dataTransfer.files)
          }}
        >
          <input
            {...field.controlProps}
            type="file"
            multiple={multiple}
            {...(accept === undefined ? {} : { accept: accept.join(',') })}
            disabled={field.disabled || busy}
            onChange={(event) => {
              void onPick(event.target.files)
              event.target.value = ''
            }}
          />
        </div>
      )}

      {files.length === 0 && removed.length === 0 ? null : (
        <ul data-formancy-part="file-list">
          {files.map((file) => (
            <li key={file.id} data-formancy-part="file-item">
              <span>{file.name}</span>
              <button
                type="button"
                disabled={field.disabled}
                onClick={() => {
                  // Out of the answer immediately, so a submit in between is
                  // correct, and remembered so it can come back.
                  setRemoved((before) => [
                    ...before,
                    { at: files.findIndex((other) => other.id === file.id), file },
                  ])
                  field.setValue(files.filter((other) => other.id !== file.id))
                }}
              >
                {/* Named with the file, so a screen reader user hears which
                    attachment a button removes rather than "remove" six
                    times over. */}
                Remove {file.name}
              </button>
            </li>
          ))}

          {/*
           * A removed attachment stays visible with a way back.
           *
           * The bytes are still in storage until the unclaimed collector runs, so
           * the removal is recoverable for free — and a misclick on the wrong row
           * of six is the ordinary way somebody loses the evidence they came to
           * attach. A row that simply disappears offers no way to notice.
           */}
          {removed.map(({ at, file }) => (
            <li key={file.id} data-formancy-part="file-item" data-state="removed">
              <span>{file.name}</span>
              <button
                type="button"
                disabled={field.disabled}
                onClick={() => {
                  setRemoved((before) => before.filter((other) => other.file.id !== file.id))
                  // Back where it was, not on the end: the order matters to
                  // somebody who numbered their attachments in a covering note.
                  const next = [...files]
                  next.splice(Math.min(at, next.length), 0, file)
                  field.setValue(next)
                }}
              >
                Undo removing {file.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* One polite region per field for the upload's own progress: the form's
          error region belongs to validation, and an upload failure is not a
          validation error. */}
      <p role="status" data-formancy-part="file-status">
        {busy ? 'Uploading…' : (failure ?? '')}
      </p>
    </FieldShell>
  )
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
  time: TimeField,
  datetime: DateTimeField,
  select: SelectField,
  radio: RadioGroupField,
  selectboxes: SelectBoxesField,
  file: FileField,
  richtext: RichTextField,
  hidden: null,
  static: StaticField,
  group: null,
  page: null,
  repeater: null,
}
