import { createContext, useContext, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { cancelUploads } from '@formancy/core'
import type { FormEngine } from '@formancy/core'
import { createFormText } from '@formancy/core/words'
import type { FormText, FormWordsByLocale } from '@formancy/core/words'
import { resolvedLocale } from '@formancy/spec'

/**
 * The engine reaches components through context, never through props drilling:
 * a form is one engine instance, and every hook resolves against it. Kept in
 * its own module so tree-shaking can drop the provider for consumers that only
 * use prop getters.
 */
const FormancyContext = createContext<FormEngine | null>(null)

/**
 * The form's own words, in the language its questions are read in (0171). Beside the engine
 * rather than on it, because the engine has no buttons — the server runs the same one.
 */
const FormancyTextContext = createContext<FormText | null>(null)

export function FormancyProvider({
  engine,
  words,
  children,
}: {
  engine: FormEngine
  /**
   * Languages a host adds, and words it changes, by locale: `{ it: { 'form.next':
   * 'Avanti' } }`, or `{ en: { 'form.submit': 'Send' } }`. Read in the language the
   * questions are, a word at a time, and English for the rest. A constant, as any context
   * value should be: a new object on every render is a new language for every control below.
   */
  words?: FormWordsByLocale
  children?: ReactNode
}) {
  // A form that goes away stops its uploads. Here rather than in the file field: the
  // field remounts whenever its row moves, and its uploads have to survive that (0130).
  useEffect(() => () => cancelUploads(engine), [engine])
  // In the catalogue the document is read in, not the engine's locale as asked: a French
  // reader of a form with no French reads English questions, and read French buttons under
  // them. Both are fixed for the engine's lifetime, so the words are fixed for the engine's.
  const text = useMemo(
    () =>
      createFormText({
        locale: resolvedLocale(engine.schema(), engine.locale()),
        ...(words === undefined ? {} : { words }),
      }),
    [engine, words],
  )
  return (
    <FormancyContext.Provider value={engine}>
      <FormancyTextContext.Provider value={text}>{children}</FormancyTextContext.Provider>
    </FormancyContext.Provider>
  )
}

export function useFormEngine(): FormEngine {
  const engine = useContext(FormancyContext)
  if (!engine) {
    throw new Error('formancy hooks need a <FormancyProvider engine={...}> above them in the tree')
  }
  return engine
}

let english: FormText | undefined

/**
 * The form's words, in the language the reader chose for it.
 *
 * English outside a `FormancyProvider`, which has no engine to take a language from — a
 * resume notice a host draws beside the form rather than inside its provider. Never the
 * browser's language: the form's is the one the reader chose, and the browser's is the
 * one their machine came with.
 */
export function useFormText(): FormText {
  const text = useContext(FormancyTextContext)
  if (text !== null) return text
  english ??= createFormText({ locale: '' })
  return english
}
