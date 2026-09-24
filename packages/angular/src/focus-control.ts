/** Reveal enclosing tabs before focusing: hidden controls cannot emit focusin. */
export function focusControl(control: HTMLElement | null): void {
  if (control === null) return
  control.dispatchEvent(new Event('formancy-reveal', { bubbles: true }))
  control.focus()
}
