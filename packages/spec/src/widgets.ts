import type { FieldType } from './types.js'

/*
 * The widget vocabulary: which presentations exist, in which version, and on which types.
 * Its own module because widgets change for their own reason — a new control on an existing
 * answer — and `types.ts` was over its size budget when version 5 added to it.
 */

/**
 * How a field should LOOK, chosen by the author, never changing what it collects.
 *
 * **The line: a widget may change how a field looks, never what it collects.** The
 * moment a hint alters the stored value, the validation, or what somebody may enter, it
 * is a field type and belongs in `FIELD_TYPES`. Each name here sits on a type whose
 * value shape it leaves exactly alone
 * ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
 *
 * **Closed, not an open string**, so `widget: "togle"` is an authoring-time error rather
 * than a form that looks right in the build that knew the name. Each new name is a
 * format change, which is the price of that.
 *
 * `autocomplete` is deliberately NOT the name for the type-ahead: that word is owed to
 * the HTML autofill token WCAG 1.3.5 asks for.
 */
/**
 * Widgets version 2 defines.
 *
 * Named separately for the same reason the field types are, and for one the field
 * types did not have: `widget` itself arrived in version 2, so a gate asking
 * whether a field HAS a widget answers yes for every one of them and says nothing
 * about which. A version 2 reader given a version 3 widget would render the
 * default control, collect the same answers and look entirely correct — which is
 * the silent failure the version line exists to prevent.
 */
export const SPEC_2_WIDGETS = ['toggle', 'datagrid', 'typeahead', 'scanner'] as const

/**
 * Version 3's widgets, named as a list of their own.
 *
 * It used to be "everything in `FIELD_WIDGETS` that is not version 2's", which
 * is an answer only while version 3 is the newest. The seam has to be derivable
 * per version or the guard checking that `MIGRATIONS.md` names each addition has
 * nothing to compare against — and the gate in `validate.ts` cannot say which
 * version an author needs.
 */
export const SPEC_3_WIDGETS = [...SPEC_2_WIDGETS, 'tagpicker'] as const

/**
 * Version 4's widgets: a number wearing different paint.
 *
 * **Both store exactly what a `number` field already stores**, which is what
 * makes them widgets rather than types. A rating is a number between two bounds
 * and so is a slider; the control differs and the answer does not. A construct
 * that changed the answer — a ranking's chosen order, a matrix's row-to-column
 * map — is a type, and those come later in this version.
 */
export const SPEC_4_WIDGETS = ['rating', 'slider'] as const

export const FIELD_WIDGETS = [...SPEC_3_WIDGETS, ...SPEC_4_WIDGETS] as const

export type FieldWidget = (typeof FIELD_WIDGETS)[number]

/**
 * Which widgets each field type accepts.
 *
 * A map rather than a flat list because `widget: "datagrid"` on a text field is an
 * author who believes they configured a grid, and a document that validates is a
 * document nobody tells them about. The JSON Schema gates the same way, through
 * the `if`/`then` branches it already uses for per-type properties, so the two
 * cannot drift — a test compares them.
 */
export const WIDGETS_BY_FIELD_TYPE = {
  /** A switch instead of a tick-box. Still `true | false | null`. */
  checkbox: ['toggle'],
  /** Rows as a table instead of stacked blocks. Still rows carrying `_id`. */
  repeater: ['datagrid'],
  /** Type to narrow a long option list. Still one offered option value. */
  select: ['typeahead'],
  /** Several answers, narrowed by typing and shown as chips. Still an array of
   *  offered option values, in the options' own order. */
  selectboxes: ['tagpicker'],
  /** A camera route to a string somebody could otherwise type. Still a string. */
  text: ['scanner'],
  /** Stars or a scale instead of a spin box, and a track instead of a field.
   *  Still one number between `min` and `max` — which is why they are widgets:
   *  a version 3 reader renders a number input and collects the same answer. */
  number: ['rating', 'slider'],
} as const satisfies Partial<Record<FieldType, readonly FieldWidget[]>>
