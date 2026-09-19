/**
 * The fixture format: a conformance case expressed as data, never as code.
 *
 * A behaviour is specified ONCE here and then executed against every driver —
 * the engine in Node, the engine in a browser, the React renderer, the Angular
 * renderer, the server's revalidation endpoint. That is only possible while a
 * fixture stays declarative JSON: the moment a case may contain a callback it
 * can only run where that callback runs, and the renderers are free to drift.
 */

import type { FieldDef, FormSchema } from '@formancy/spec'

/** JSON, and nothing but JSON. A fixture must survive a file round-trip unchanged. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/**
 * A field as a fixture declares it.
 *
 * The model shape — `key`, `type`, `required`, `fields`, `clearOnHide` — comes
 * straight from `FieldDef` in @formancy/spec, and behaviour comes from the
 * spec's `logic` section on the schema; a fixture must never say something the
 * spec cannot. What remains here is presentation the conformance suite has to
 * carry itself because @formancy/spec has not yet landed its `layout` and
 * `i18n` sections: the accessible names a driver resolves controls by, and the
 * option lists and repeater bounds a renderer needs to draw the form at all.
 * When those sections land, this interface shrinks to an import.
 *
 * `fields` is re-declared only to deepen it: the spec's `FieldDef[]` becomes a
 * readonly tree of fixture fields, which a mutable array cannot extend.
 */
export interface ConformanceFieldDef extends Omit<FieldDef, 'fields'> {
  /**
   * The field's accessible name. Inlined rather than referenced through an
   * i18n section because a driver may only find a control by its accessible
   * name, so the name is part of the case, and a case should be readable as
   * one file.
   */
  readonly label?: string
  /** The fields held inside a `group`, a `page` or a repeater. */
  readonly fields?: readonly ConformanceFieldDef[]
  readonly readOnly?: boolean
  readonly options?: readonly ConformanceOption[]
  readonly minItems?: number
  readonly maxItems?: number
  /** Accessible name of a repeater's add control. */
  readonly addLabel?: string
  /** Accessible name of a repeater item's remove control. */
  readonly removeLabel?: string
}

export interface ConformanceOption {
  readonly value: JsonValue
  readonly label: string
}

/**
 * The schema a fixture ships. Only `model` deviates from `FormSchema`, and only
 * to deepen its fields into `ConformanceFieldDef`; `logic` is inherited from
 * the spec verbatim, so a fixture's rules are exactly what an engine consumes.
 */
export interface ConformanceSchema extends Omit<FormSchema, 'model'> {
  readonly model: { readonly fields: readonly ConformanceFieldDef[] }
}

/** Set one or more values, in the order written. */
export interface SetStep {
  readonly set: Readonly<Record<string, JsonValue>>
}

export interface ExpectVisibleStep {
  readonly expectVisible: readonly string[]
}

export interface ExpectHiddenStep {
  readonly expectHidden: readonly string[]
}

export interface ExpectValueStep {
  readonly expectValue: Readonly<Record<string, JsonValue>>
}

/**
 * The exact set of message codes on each listed path, order-insensitive.
 * An empty array asserts the path carries no message at all, which is how a
 * fixture pins the difference between "not validated" and "valid".
 */
export interface ExpectErrorsStep {
  readonly expectErrors: Readonly<Record<string, readonly string[]>>
}

/** `true` asserts the whole form is clean; a list asserts only those paths are. */
export interface ExpectNoErrorsStep {
  readonly expectNoErrors: true | readonly string[]
}

export interface SubmitStep {
  readonly submit: true
}

export interface ExpectSubmitStep {
  readonly expectSubmit: {
    readonly status: SubmitStatus
    /** Deep-equality against the accepted payload. Omit rather than over-specify. */
    readonly data?: JsonValue
  }
}

/** Activate a control: a command path such as `contacts#add`, or a field path. */
export interface ActivateStep {
  readonly activate: string
}

export interface AddItemStep {
  readonly addItem: string
}

export interface RemoveItemStep {
  readonly removeItem: {
    readonly path: string
    readonly index: number
  }
}

export interface NextStep {
  readonly next: true
}

export interface BackStep {
  readonly back: true
}

export interface ExpectPageStep {
  readonly expectPage: string
}

/**
 * A step, discriminated by its single key rather than by a `type` field.
 *
 * Narrow with the `in` operator (`if ('set' in step)`). The shape is chosen so
 * a fixture reads as a transcript of what a person did and what they then saw,
 * which is what makes a failure legible to someone debugging a renderer they
 * did not write.
 */
export type FixtureStep =
  | SetStep
  | ExpectVisibleStep
  | ExpectHiddenStep
  | ExpectValueStep
  | ExpectErrorsStep
  | ExpectNoErrorsStep
  | SubmitStep
  | ExpectSubmitStep
  | ActivateStep
  | AddItemStep
  | RemoveItemStep
  | NextStep
  | BackStep
  | ExpectPageStep

/** The key that discriminates a step. Keep in step with `FixtureStep`. */
export type StepKind =
  | 'set'
  | 'activate'
  | 'addItem'
  | 'removeItem'
  | 'next'
  | 'back'
  | 'submit'
  | 'expectVisible'
  | 'expectHidden'
  | 'expectValue'
  | 'expectErrors'
  | 'expectNoErrors'
  | 'expectSubmit'
  | 'expectPage'

export type SubmitStatus = 'accepted' | 'rejected'

export interface Fixture {
  /** Unique within a suite: it is the test name and the failure headline. */
  readonly name: string
  /** Why the behaviour is correct, for the renderer author who fails it. */
  readonly description?: string
  readonly tags?: readonly string[]
  readonly schema: ConformanceSchema
  readonly initialValues?: Readonly<Record<string, JsonValue>>
  readonly steps: readonly FixtureStep[]
}
