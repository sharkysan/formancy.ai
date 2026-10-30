import { ElementRef, inject } from '@angular/core'

/**
 * Takes the element Angular draws a component in out of layout. Called first in the
 * constructor of every component with an element of its own.
 *
 * Angular gives every component an element of its own, and the React builder has none: its
 * panes are their own outermost parts. A theme places those parts by `data-formancy-part`,
 * often as the items of a grid, and a host element that is a box becomes the item in their
 * place. `formancy-translation-review` was the one that showed. It draws nothing on the
 * default language, and it still took the first cell of the translations pane's two columns,
 * so the table a translator works in moved into the narrow one
 * ([0174](../../../docs/decisions/0174-the-builders-hosts-take-no-part-in-layout.md)).
 * `display: contents` keeps what the component draws and drops the box, so a stylesheet
 * written for the React builder's markup places the Angular builder's the same. It drops the
 * element from the accessibility tree too, which is right, because it has no role and names
 * nothing.
 *
 * Set through CSSOM, and never as a component style. Angular emits a component style as a
 * `<style>` element, which `style-src 'self'` blocks without a nonce, and CSP governs no
 * CSSOM. This is the renderer's mechanism, for the renderer's reason
 * ([0079](../../../docs/decisions/0079-a-host-is-undone-without-a-stylesheet.md)). Not a host
 * directive, which would be the composition API's way to share it: a host directive is in
 * each exported component's published metadata, so it would have to be exported too, and
 * this is nothing a consumer should call. `host.test.ts` finds every component the package
 * can draw and holds each to it.
 */
export function takeHostOutOfLayout(): void {
  inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.style.setProperty('display', 'contents')
}
