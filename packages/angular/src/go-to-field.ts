import { Injector, afterNextRender, inject } from '@angular/core'
import { parsePath } from '@formancy/core'
import { focusControl } from './focus-control.js'
import { injectEngine } from './provide.js'

/**
 * Take the person to a question: to its page first, on a paged form, and to its control once
 * that page is drawn — into a group's first option, since a fieldset takes no focus, and past a
 * tab a layout hides it behind (0213). What the error summary's links and the review's Change do,
 * one function for both and for a host's own list of questions; the React binding's
 * `useGoToField` is the same. Call it in an injection context; the function it returns can be
 * called anywhere. A path no field has throws, as the engine does for one.
 */
export function injectGoToField(): (path: string) => void {
  const engine = injectEngine()
  const injector = inject(Injector)
  return (path: string) => {
    const at = parsePath(path)
    const id = engine.getFieldSnapshot(at).ids.control
    const wizard = engine.wizard()
    const page = engine.pageOf(at)
    const drawn = document.getElementById(id)
    // Focused now when it is on the page and drawn: nothing may render after a call from outside
    // Angular, and a callback waiting for one would never run.
    if ((wizard === undefined || wizard.page() === page) && drawn !== null) return focusControl(drawn)
    if (wizard !== undefined && wizard.page() !== page) wizard.goTo(page)
    // On another page, or not drawn yet — the review gives the form back on its next render —
    // so focused once that render has drawn it (0205).
    afterNextRender(() => focusControl(document.getElementById(id)), { injector })
  }
}
