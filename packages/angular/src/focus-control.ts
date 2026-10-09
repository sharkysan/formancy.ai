/** Reveal enclosing tabs before focusing: hidden controls cannot emit focusin. */
export function focusControl(control: HTMLElement | null): void {
  if (control === null) return
  control.dispatchEvent(new Event('formancy-reveal', { bubbles: true }))
  control.focus()
  // The id may name a component's host rather than its control: a design system's
  // checkbox puts the engine's id on its host and the input inside, and focusing a host
  // that cannot take focus does nothing at all (0132). The same in both renderers.
  if (document.activeElement !== control) {
    control.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
  }
}
