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
 * Extends `FieldDef` from @formancy/spec with the logic and presentation the
 * conformance suite exercises. These properties live here rather than in the
 * spec because @formancy/spec has not yet landed its `logic`, `layout` and
 * `i18n` sections; when it does, this interface shrinks to an import. The
 * suite is written first on purpose — it is what the spec will be held to.
 */
export interface ConformanceFieldDef extends FieldDef {
  /**
   * The field's accessible name. Inlined rather than referenced through an
   * i18n section because a driver may only find a control by its accessible
   * name, so the name is part of the case, and a case should be readable as
   * one file.
   */
  readonly label?: string
  /** Children of a `group`, `page` or `repeater`. */
  readonly children?: readonly ConformanceFieldDef[]
  /** CEL. The field is rendered only while this evaluates truthy. */
  readonly visibleWhen?: string
  /** CEL. The field is required only while this evaluates truthy. */
  readonly requiredWhen?: string
  /** CEL. The field's value is derived, never typed. */
  readonly calculate?: string
  /** Drop the value while the field is hidden. Default false: the value is retained. */
  readonly clearOnHide?: boolean
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
