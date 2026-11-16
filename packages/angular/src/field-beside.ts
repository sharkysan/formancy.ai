import { InjectionToken, computed, inject } from '@angular/core'
import type { Signal, TemplateRef } from '@angular/core'
import type { FieldBinding } from './field.js'

/**
 * What a host's template beside a field's control is given: the field's path, and the field's
 * binding, as the addition's template is (0233) and for the same reason: a component cannot ask
 * for a binding by a path that only arrives as its input, so the template is handed it.
 */
export interface FormancyFieldBesideContext {
  readonly $implicit: string
  readonly field: FieldBinding
}

/**
 * What a host draws beside a field's control, on the control's line, by the field's path, or
 * nothing (0237): a template the host declares, drawn in its own injector as any template it
 * declares.
 */
export type FormancyFieldBeside = (path: string) => TemplateRef<FormancyFieldBesideContext> | null | undefined

/**
 * The form's `fieldBeside` input, handed to every field below it. The fields are created by the
 * registry at run time, where an input cannot reach, so it travels as the registry does.
 */
export const FORMANCY_FIELD_BESIDE = new InjectionToken<Signal<FormancyFieldBeside | undefined>>('formancy.field-beside')

/**
 * The host's template beside the control of the field at `path`, or undefined where it gives
 * none. Asked for only when read, so a control that draws nothing beside its box never asks.
 */
export function injectFieldBeside(path: () => string): Signal<TemplateRef<FormancyFieldBesideContext> | undefined> {
  const beside = inject(FORMANCY_FIELD_BESIDE, { optional: true })
  return computed(() => beside?.()?.(path()) ?? undefined)
}
