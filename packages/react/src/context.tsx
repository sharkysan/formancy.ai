import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { cancelUploads } from '@formancy/core'
import type { FormEngine } from '@formancy/core'

/**
 * The engine reaches components through context, never through props drilling:
 * a form is one engine instance, and every hook resolves against it. Kept in
 * its own module so tree-shaking can drop the provider for consumers that only
 * use prop getters.
 */
const FormancyContext = createContext<FormEngine | null>(null)

export function FormancyProvider({ engine, children }: { engine: FormEngine; children?: ReactNode }) {
  // A form that goes away stops its uploads. Here rather than in the file field: the
  // field remounts whenever its row moves, and its uploads have to survive that (0130).
  useEffect(() => () => cancelUploads(engine), [engine])
  return <FormancyContext.Provider value={engine}>{children}</FormancyContext.Provider>
}

export function useFormEngine(): FormEngine {
  const engine = useContext(FormancyContext)
  if (!engine) {
    throw new Error('formancy hooks need a <FormancyProvider engine={...}> above them in the tree')
  }
  return engine
}
