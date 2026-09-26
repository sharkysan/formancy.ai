/**
 * jsdom gaps that ProseMirror reaches for.
 *
 * The site's examples include a `richtext` field and the site supplies the
 * WYSIWYG editor, so mounting one runs ProseMirror inside jsdom. ProseMirror asks
 * the DOM where things are on screen, and jsdom has no layout: it implements
 * `getBoundingClientRect` on `Element` only, `getClientRects` nowhere, and
 * `elementFromPoint` not at all. ProseMirror asks all three, including on text
 * nodes. The resulting TypeErrors surface as dozens of unhandled errors that fail
 * the run while every test passes.
 *
 * Stubbed rather than worked around in the tests, because it is an absence in the
 * test environment rather than anything about this code. Each returns the honest
 * answer for a document with no layout — everything at the origin with no size,
 * no rectangles, no element at a point — and ProseMirror handles all of them.
 *
 * Assigned with `??=` so a future jsdom that implements any of these wins over
 * this file rather than being overridden by it.
 */
const ORIGIN: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
}

const NO_RECTS = Object.assign([ORIGIN], { item: () => ORIGIN }) as unknown as DOMRectList

if (typeof document !== 'undefined') {
  document.elementFromPoint ??= () => null

  // `Node` rather than `Element`: ProseMirror measures text nodes too.
  for (const prototype of [Node.prototype, Range.prototype]) {
    const target = prototype as {
      getBoundingClientRect?: () => DOMRect
      getClientRects?: () => DOMRectList
    }
    target.getBoundingClientRect ??= () => ORIGIN
    target.getClientRects ??= () => NO_RECTS
  }
}
