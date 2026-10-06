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

import { CheckboxField, RadioGroupField, SelectField } from './fields/choice-fields.js'
import { FileField } from './fields/file-field.js'
import { RichTextField } from './fields/rich-text-field.js'
import { SelectBoxesSwitch } from './fields/selectboxes-field.js'
import { NumberSwitch } from './fields/scale-fields.js'
import { SignatureField } from './fields/signature-field.js'
import { StaticField } from './fields/static-field.js'
import { DateField, DateTimeField, TimeField } from './fields/temporal-fields.js'
import { TextField, TextareaField } from './fields/text-fields.js'
import type { FieldComponent, FormancyFormProps, Registry } from './fields/internals.js'

/**
 * The form, the list that walks it, and which component renders which type.
 *
 * What is left after the controls moved into `fields/`: 2,154 lines that had
 * become the place things went. Three subjects remain here and they are one —
 * a form renders a list, a list renders a slot, a slot may render a repeater,
 * and a repeater renders a list. Mutual recursion is not a seam.
 *
 * `null` in the map is not an omission. `hidden` renders nothing by design, and
 * `group`, `page` and `repeater` are containers the list itself walks rather
 * than controls.
 */
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
  // The live pages, with the index they have in the form kept beside them: a
  // form that named a step Next never reaches reads as a broken button rather
  // than as a page that does not apply, and `aria-current` has to compare
  // against the ABSOLUTE index because that is what `page` is.
  const pages = engine
    .pages()
    .map((page, index) => ({ ...page, index }))
    .filter((page) => !page.skipped)

  return (
    <>
      <nav data-formancy-part="stepper" aria-label="Progress">
        <ol>
          {pages.map((page) => (
            <li key={page.key} aria-current={page.index === wizard.page ? 'step' : undefined}>
              {engine.text(page.def.label) ?? page.key}
            </li>
          ))}
        </ol>
      </nav>
      <FieldList {...props} page={wizard.page} />
      <div data-formancy-part="wizard-nav">
        {wizard.canGoBack ? (
          <button type="button" onClick={() => wizard.back()}>
            Back
          </button>
        ) : null}
        {wizard.canGoNext ? (
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

  /** The control in one cell: the leaf the column's child field collects into.
   *
   *  One leaf, because a grid's rows are FLAT -- a child holding fields of its own is
   *  refused when the document is saved
   *  ([0078](../../../docs/decisions/0078-a-grid-row-is-flat.md)). This walked the whole
   *  subtree under the child while a group could be a column, and every clause that made
   *  that walk safe is gone with the arrangement it served.
   *
   *  Still a filter over the paths that EXIST rather than the path the column implies, so
   *  a document nobody validated renders an empty cell instead of asking the engine about
   *  a field it does not have. */
  const leavesOf = (index: number, key: string): string[] => {
    const wanted = `${wire}[${String(index)}].${key}`
    return engine.fieldPaths().filter((leaf) => leaf === wanted)
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

/**
 * The built-in unstyled components. `null` means the type renders nothing here:
 * a hidden field is carried in the submission and never shown, and the
 * container types are laid out by their own machinery rather than by a leaf
 * slot.
 */
const DEFAULT_COMPONENTS: Record<FieldType, FieldComponent | null> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberSwitch,
  checkbox: CheckboxField,
  date: DateField,
  time: TimeField,
  datetime: DateTimeField,
  select: SelectField,
  radio: RadioGroupField,
  selectboxes: SelectBoxesSwitch,
  file: FileField,
  richtext: RichTextField,
  signature: SignatureField,
  hidden: null,
  static: StaticField,
  group: null,
  page: null,
  repeater: null,
}

export type {
  FieldComponent,
  FieldComponentProps,
  FormancyFormProps,
  Registry,
  SubmitOutcome,
} from './fields/internals.js'
