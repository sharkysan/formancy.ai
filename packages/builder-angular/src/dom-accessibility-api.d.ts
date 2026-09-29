/**
 * Types for `dom-accessibility-api`, which ships declarations it does not advertise.
 *
 * The package has no `types` field and its `exports` map carries no `types` condition,
 * so TypeScript resolves the import to `dist/index.mjs` and gives up — even though
 * `dist/*.d.ts` is sitting right beside it. Declared here rather than worked around at
 * the call site, because the alternative was `any` on the one function whose return
 * value the datagrid's main guard compares.
 *
 * A test-only dependency: it is in `devDependencies`, nothing ships it, and it is
 * already in the tree as `@testing-library/dom`'s own. It is used because the accessible
 * name has to be computed by a real implementation — the conformance driver matches each
 * label source separately and would keep passing while a computed name grew a column
 * heading in front of it.
 */
declare module 'dom-accessibility-api' {
  export function computeAccessibleName(element: Element): string
  export function computeAccessibleDescription(element: Element): string
}
