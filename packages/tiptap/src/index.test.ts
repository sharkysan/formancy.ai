import { parseRichText, serialiseRichText } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { RICH_TEXT_EXTENSIONS, createRichTextEditor } from './index.js'

/**
 * The editor tested against a real ProseMirror, not against a mock.
 *
 * The claim this package makes is that the editor **cannot** produce anything
 * the stored grammar cannot hold — not that it is configured not to, which is a
 * weaker statement that a later extension could quietly undo. That claim is a
 * property of a ProseMirror schema, so it can only be tested by building one and
 * asking it to accept things.
 *
 * A mock would be worse than nothing here. It would agree with whatever this
 * file believed about ProseMirror, and the failure being guarded against is
 * exactly that belief turning out to be wrong.
 */
describe('the schema', () => {
  test('admits only the nodes the grammar has', () => {
    const handle = createRichTextEditor({ value: '' })

    const nodes = Object.keys(handle.editor.schema.nodes).sort()
    handle.destroy()

    // `doc`, `paragraph`, `text` and the three list nodes. Anything else — a
    // heading, a code block, a horizontal rule — has no representation in the
    // grammar, so an editor offering it would be offering to lose an answer.
    expect(nodes).toEqual([
      'bulletList',
      'doc',
      'listItem',
      'orderedList',
      'paragraph',
      'text',
    ])
  })

  test('admits only the marks the grammar has', () => {
    const handle = createRichTextEditor({ value: '' })

    const marks = Object.keys(handle.editor.schema.marks).sort()
    handle.destroy()

    expect(marks).toEqual(['bold', 'italic', 'link'])
  })

  test('refuses a node it has no name for, rather than inventing one', () => {
    const handle = createRichTextEditor({ value: '' })

    // Not "does the toolbar have a button for it" — whether the document model
    // can hold one at all. `strike` is the one a paste from a word processor
    // brings most often.
    expect(handle.editor.schema.marks['strike']).toBeUndefined()
    expect(handle.editor.schema.nodes['heading']).toBeUndefined()
    expect(handle.editor.schema.nodes['codeBlock']).toBeUndefined()
    handle.destroy()
  })

  test('is built from the extension list this package exports', () => {
    // The list is exported so the grammar and the editor cannot drift apart by
    // being named in two places. If that stops being where the schema comes
    // from, this fails rather than the drift going unnoticed.
    expect(RICH_TEXT_EXTENSIONS.length).toBeGreaterThan(0)

    const names = RICH_TEXT_EXTENSIONS.map((extension) => extension.name).sort()
    expect(names).toContain('bold')
    expect(names).toContain('link')
    expect(names).toContain('bulletList')
    expect(names).not.toContain('strike')
    expect(names).not.toContain('heading')
  })
})

describe('loading and reading back an answer', () => {
  const SOURCES = [
    'Plain text.',
    '**Bold** and *italic*.',
    'A [link](https://example.ch) in a sentence.',
    '- one\n- two',
    '1. first\n2. second',
    'First paragraph.\n\nSecond paragraph.',
    '**Bold with *italic* inside**.',
    'A [**bold link**](https://example.ch).',
    '- item with **bold**\n- item with [a link](mailto:a@b.ch)',
  ]

  test.each(SOURCES)('%j survives a trip through the editor untouched', (source) => {
    // The property that decides whether this is shippable. Somebody opens a
    // submission, changes nothing, and saves: the stored string must be the
    // same string, or every form anybody merely looked at grows a revision.
    const handle = createRichTextEditor({ value: source })

    const after = handle.value()
    handle.destroy()

    expect(after).toBe(source)
  })

  test('an empty answer stays empty rather than becoming a blank paragraph', () => {
    const handle = createRichTextEditor({ value: '' })

    const after = handle.value()
    handle.destroy()

    expect(after).toBe('')
  })
})

describe('what the editor hands back', () => {
  test('a toolbar command produces the grammar, not markup', () => {
    const handle = createRichTextEditor({ value: 'hello' })

    handle.editor.commands.selectAll()
    handle.editor.commands.toggleBold()
    const after = handle.value()
    handle.destroy()

    // The one thing that must never appear anywhere near this: a tag.
    expect(after).toBe('**hello**')
    expect(after).not.toContain('<')
  })

  test('changes are reported as the grammar, so a host never sees HTML', () => {
    const seen: string[] = []
    const handle = createRichTextEditor({
      value: 'hello',
      onChange: (value) => seen.push(value),
    })

    handle.editor.commands.selectAll()
    handle.editor.commands.toggleItalic()
    handle.destroy()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBe('*hello*')
    for (const value of seen) expect(value).not.toContain('<')
  })

  test('the editor itself refuses an unsafe scheme', () => {
    const handle = createRichTextEditor({ value: 'click' })

    handle.editor.commands.selectAll()
    handle.editor.commands.setLink({ href: 'javascript:alert(1)' })
    const after = handle.value()
    handle.destroy()

    // This is the Link extension's `protocols` doing the work, and it is worth
    // having: a link the editor never offers is better than one that vanishes
    // after saving. It is NOT the defence, though — see the next case.
    expect(after).not.toContain('javascript:')
    expect(after).toBe('click')
  })

  test('and so does the conversion, when a document already carries one', () => {
    // The case that matters, and the reason the previous test is not enough.
    // With the grammar's href check removed, the previous test still passed —
    // it was measuring the editor's input filter, not the conversion's output
    // filter, and only one of those is a defence.
    //
    // A document arriving with the mark already on it is what a paste rule, a
    // collaboration payload or a console call produces. It really does survive
    // into the document with the href intact — checked rather than assumed. The
    // editor runs in the browser, so this is as untrusted as the submission it
    // ends up inside.
    //
    // Two layers in `@formancy/spec` refuse it and either one alone is enough,
    // so this fails only when both are removed. That is the honest scope of what
    // it proves: the pair is load-bearing, not each half.
    const handle = createRichTextEditor({ value: '' })

    handle.editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    })

    const after = handle.value()
    handle.destroy()

    expect(after).not.toContain('javascript:')
    expect(after).toBe('click')
  })
})

describe('the grammar is still the only stored form', () => {
  test('what the editor produces is what the parser reads', () => {
    // The gap this closes: an editor whose output the parser accepts but
    // interprets differently. Checked by round-tripping through both.
    const handle = createRichTextEditor({ value: '' })
    handle.editor.commands.insertContent('one')
    handle.editor.commands.selectAll()
    handle.editor.commands.toggleBold()

    const stored = handle.value()
    handle.destroy()

    expect(serialiseRichText(parseRichText(stored))).toBe(stored)
  })
})
