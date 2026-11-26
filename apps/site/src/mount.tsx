import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

/**
 * A page of the site, in the browser (0243).
 *
 * The build has already written the page into its root (`prerender.mjs`, from `render.tsx`),
 * so React takes over the markup the server sent rather than drawing it again: the same
 * tree, `<StrictMode>` included, so the first render in the browser is the one the server
 * made, and nothing a visitor or a crawler read is replaced. The development server writes
 * nothing into the root, so there it is drawn.
 *
 * One function for every entry, so no page can take the markup over one way and another
 * page another: a page drawn with `createRoot` over its markup would throw the server's
 * away and draw it again, and every check of the HTML would still pass. It answers the
 * root React draws in, which an entry has no use for and a test unmounts.
 */
export function mount(root: HTMLElement, page: ReactElement): Root {
  const tree = <StrictMode>{page}</StrictMode>
  if (root.firstElementChild !== null) return hydrateRoot(root, tree)
  const drawn = createRoot(root)
  drawn.render(tree)
  return drawn
}

/**
 * Something else drawn in a page's place: a share card at `?og`, whose root holds the page
 * the build wrote, which is not the card. So it is emptied first, and the card drawn.
 */
export function replace(root: HTMLElement, element: ReactElement): void {
  root.replaceChildren()
  createRoot(root).render(<StrictMode>{element}</StrictMode>)
}
