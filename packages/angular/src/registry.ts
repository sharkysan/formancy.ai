import { InjectionToken, inject } from '@angular/core'
import type { Provider, Type } from '@angular/core'
import type { FieldType } from '@formancy/spec'

/**
 * What a field component learns about its slot. React passes `{ path, label }`
 * as props; here they travel through DI because the components are created
 * dynamically by the registry, and an injection token is how Angular hands
 * per-instance context across a dynamic boundary without inputs to mistype.
 */
export interface FormancyFieldContext {
  readonly path: string
  readonly label: string
}

export const FORMANCY_FIELD_CONTEXT = new InjectionToken<FormancyFieldContext>(
  'formancy.field-context',
)

export function injectFieldContext(): FormancyFieldContext {
  const context = inject(FORMANCY_FIELD_CONTEXT, { optional: true })
  if (context === null) {
    throw new Error(
      'formancy field components render inside a formancy-field slot, which provides FORMANCY_FIELD_CONTEXT for the path and label',
    )
  }
  return context
}

/**
 * The component registry — theming mechanism number two, same words as React.
 * The schema decides WHAT a field is; the registry decides what RENDERS it,
 * with per-path entries beating per-type entries beating the built-in
 * defaults. A design system replaces the entire visual layer by providing a
 * registry, without forking anything.
 */
export interface FormancyRegistry {
  byType?: Partial<Record<FieldType, Type<unknown>>>
  byPath?: Record<string, Type<unknown>>
}

export const FORMANCY_REGISTRY = new InjectionToken<FormancyRegistry>('formancy.registry')

export function provideFormancyRegistry(registry: FormancyRegistry): Provider[] {
  return [{ provide: FORMANCY_REGISTRY, useValue: registry }]
}
