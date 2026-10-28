import { useCallback, useEffect, useState } from 'react'
import { parsePath } from '@formancy/core'
import { useFormEngine } from './context.js'
import { focusControl } from './focus-control.js'

/**
 * Take the person to a question: to its page first, on a paged form, and to its control once
 * that page is drawn — into a group's first option, since a fieldset takes no focus, and past a
 * tab a layout hides it behind (0213). What the error summary's links and the review's Change do,
 * one function for both and for a host's own list of questions; the Angular binding's
 * `injectGoToField` is the same. A path no field has throws, as the engine does for one.
 */
export function useGoToField(): (path: string) => void {
  const engine = useFormEngine()
  // A control on another page is drawn only once the wizard is there, so it is focused after
  // that commit rather than in the call (0205).
  const [focusing, setFocusing] = useState<{ id: string } | undefined>(undefined)
  useEffect(() => {
    if (focusing === undefined) return
    focusControl(document.getElementById(focusing.id))
    setFocusing(undefined)
  }, [focusing])

  return useCallback(
    (path: string) => {
      const at = parsePath(path)
      const wizard = engine.wizard()
      const page = engine.pageOf(at)
      if (wizard !== undefined && wizard.page() !== page) wizard.goTo(page)
      // A fresh object each time, so asking twice for one field focuses it twice.
      setFocusing({ id: engine.getFieldSnapshot(at).ids.control })
    },
    [engine],
  )
}
