import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { FormEngine } from '@formancy/core'

/**
 * The engine reaches components through context, never through props drilling:
 * a form is one engine instance, and every hook resolves against it. Kept in
 * its own module so tree-shaking can drop the provider for consumers that only
 * use prop getters.
 */
const FormancyContext = createContext<FormEngine | null>(null)

export function FormancyProvider({ engine, children }: { engine: FormEngine; children?: ReactNode }) {
  return <FormancyContext.Provider value={engine}>{children}</FormancyContext.Provider>
}

export function useFormEngine(): FormEngine {
  const engine = useContext(FormancyContext)
  if (!engine) {
    throw new Error('formancy hooks need a <FormancyProvider engine={...}> above them in the tree')
  }
  return engine
}
