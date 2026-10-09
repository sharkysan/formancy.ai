import { describe, expect, test } from 'vitest'
import { layoutNodeShows } from './layout.js'
import type { LayoutNode } from './layout.js'

/**
 * Which of a layout's nodes have anything to show, given which answers are shown.
 *
 * Both renderers draw a paged form's layout one page at a time, and each decides which
 * sections the page somebody is on leaves empty. Decided here, once: the two had each
 * decided something different — one drew every page's fields on every step, the other
 * dropped the layout altogether (0137).
 */
const onPageOne = (path: string): boolean => ['name', 'email'].includes(path)

describe('a layout node shows', () => {
  test('a field when its answer does', () => {
    expect(layoutNodeShows({ kind: 'field', path: 'name' }, onPageOne)).toBe(true)
    expect(layoutNodeShows({ kind: 'field', path: 'street' }, onPageOne)).toBe(false)
  })

  test('a code by the answer it encodes, which is the page it belongs to', () => {
    expect(layoutNodeShows({ kind: 'qrcode', path: 'email' }, onPageOne)).toBe(true)
    expect(layoutNodeShows({ kind: 'qrcode', path: 'street' }, onPageOne)).toBe(false)
  })

  test('a container while anything inside it does, however deep', () => {
    const mixed: LayoutNode = {
      kind: 'section',
      children: [
        { kind: 'row', children: [{ kind: 'field', path: 'street' }] },
        { kind: 'row', children: [{ kind: 'field', path: 'email' }] },
      ],
    }
    expect(layoutNodeShows(mixed, onPageOne)).toBe(true)
  })

  test('but not a container with nothing on this page — an empty heading is not a section', () => {
    const elsewhere: LayoutNode = {
      kind: 'section',
      label: 'Address',
      children: [{ kind: 'row', children: [{ kind: 'field', path: 'street' }] }],
    }
    expect(layoutNodeShows(elsewhere, onPageOne)).toBe(false)
    expect(layoutNodeShows({ kind: 'section', children: [] }, onPageOne)).toBe(false)
  })
})
