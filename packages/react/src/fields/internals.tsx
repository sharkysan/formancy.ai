import type { ComponentType, ReactNode } from 'react'
import { isImageSource } from '@formancy/spec'
import type { FieldDef, FieldType } from '@formancy/spec'
import { useFormEngine } from '../context.js'
import { useField } from '../use-field.js'
import type { FieldBinding } from '../use-field.js'


/**
 * The pieces every control shares: the shell it renders inside, the prop shapes, and the few helpers more than one of them needs.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
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

/** Shared unstyled shell: real label, control, error text as the describedby
 *  target. Zero CSS; `data-formancy-part` is the styling hook. */
export function FieldShell({
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
export function statusState({
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
export function RequiredHint({ field }: { field: ReturnType<typeof useField> }) {
  if (!field.required) return null
  return (
    <span data-formancy-part="required-hint" id={field.props.hint.id}>
      required
    </span>
  )
}

/** One option's element id, in the shape the radio group already uses, so a
 *  reader of the DOM meets one convention rather than two. */
export function optionDomId(field: FieldBinding, value: string): string {
  return `${field.ids.control}:option:${value}`
}

/** An option as a control draws it: its words resolved, and its picture if it has one. */
export interface ResolvedOption {
  value: string
  label: string
  /** `alt` is empty when the label says everything: the picture is then decoration. */
  image?: { src: string; alt: string }
}

/**
 * Option labels resolved to strings, since a label may be a message reference.
 * Falling back to the stored value keeps an untranslated option selectable
 * rather than blank. A picture from somewhere the format does not allow is left
 * out, by the same test the Angular binding makes (0126).
 */
export function useResolvedOptions(field: { def: FieldDef }): ResolvedOption[] {
  const engine = useFormEngine()
  return (field.def.options ?? []).map((option) => ({
    value: option.value,
    label: engine.text(option.label) ?? option.value,
    ...(option.image !== undefined && isImageSource(option.image.src)
      ? { image: { src: option.image.src, alt: engine.text(option.image.alt) ?? '' } }
      : {}),
  }))
}

/**
 * An option's picture, inside its label so that pressing it chooses the option and
 * its text alternative joins the option's name. Lazy, because a long list of
 * pictured options is a page of images the person may never scroll to.
 */
export function OptionPicture({ option }: { option: ResolvedOption }) {
  if (option.image === undefined) return null
  // The space is part of the picture: without it the text alternative and the label
  // run together in the option's name — "…in the sunCat" — which is what a screen
  // reader would say.
  return (
    <>
      <img
        data-formancy-part="option-image"
        src={option.image.src}
        alt={option.image.alt}
        loading="lazy"
        decoding="async"
      />{' '}
    </>
  )
}

/** The answer a signature field holds: a mark, or a name. */
export interface SignatureAnswerValue {
  drawn?: Array<Array<[number, number]>>
  typed?: string
}
