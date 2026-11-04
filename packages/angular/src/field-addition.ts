import { InjectionToken, computed, inject } from '@angular/core'
import type { Signal, TemplateRef } from '@angular/core'
import type { FieldBinding } from './field.js'

/**
 * What a host's template under a field is given: the field's path, and the field's binding, as
 * React's `useField(path)` gives a host component there (0233). A component cannot ask for a
 * binding by a path that only arrives as its input, so the template is handed it.
 */
export interface FormancyFieldAdditionContext {
  readonly $implicit: string
  readonly field: FieldBinding
}

/**
 * What a host draws under a field, by the field's path, or nothing (0233): a template the host
 * declares, drawn in its own injector as any template it declares.
 */
export type FormancyFieldAddition = (path: string) => TemplateRef<FormancyFieldAdditionContext> | null | undefined

/**
 * The form's `fieldAddition` input, handed to every field below it. The fields are created by the
 * registry at run time, where an input cannot reach, so it travels as the registry does.
 */
export const FORMANCY_FIELD_ADDITION = new InjectionToken<Signal<FormancyFieldAddition | undefined>>('formancy.field-addition')

/** The host's template for the field at `path`, or undefined where it gives none. */
export function injectFieldAddition(path: () => string): Signal<TemplateRef<FormancyFieldAdditionContext> | undefined> {
  const addition = inject(FORMANCY_FIELD_ADDITION, { optional: true })
  return computed(() => addition?.()?.(path()) ?? undefined)
}
