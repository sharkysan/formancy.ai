/**
 * The glyphs the playground draws on the buttons beside a field (0237), for both renderers: one
 * path each on a 16-unit square, filled and sized by the theme, which draws an icon there in the
 * button's colour at the size of the box's text, so neither carries a style of its own.
 */

/** An arrow leaving a box: open what the answer points to. */
export const OPEN_GLYPH =
  'M9 2h5v5h-1.5V4.56L8.03 9.03 6.97 7.97 11.44 3.5H9zM2 4.5A1.5 1.5 0 0 1 3.5 3H7v1.5H3.5v8h8V9H13v3.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 2 12.5z'

/** A cross: take the answer away. */
export const CLEAR_GLYPH = 'M4.28 3.22 8 6.94l3.72-3.72 1.06 1.06L9.06 8l3.72 3.72-1.06 1.06L8 9.06l-3.72 3.72-1.06-1.06L6.94 8 3.22 4.28z'
