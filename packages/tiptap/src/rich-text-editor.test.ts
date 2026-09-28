import { parseRichText, serialiseRichText } from '@formancy/spec'
import type { RichCommand } from '@formancy/spec'
import { describe, expect, test } from 'vitest'
import { RICH_TEXT_EXTENSIONS, createRichTextEditor } from './rich-text-editor.js'

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

describe('newlines', () => {
  test('a fresh editor contains a paragraph, so there is a block to split', () => {
    const handle = createRichTextEditor({ value: '' })
    const dom = handle.editor.view.dom

    // This was the bug, found live in the playground: `innerHTML` was exactly
    // `""`. A ProseMirror `doc` is `block+`, an empty answer was being converted
    // to a doc with no children, and the editor rendered a contenteditable with
    // no `<p>` in it. Nothing for Enter to split, so **newlines did nothing**.
    //
    // Asserted against the DOM rather than against the value, because that is
    // where it shows: with the fix reverted, every value-level case below still
    // passes under jsdom and only this one fails. A browser is stricter than
    // jsdom about an invalid document, which is why the bug reached the
    // playground while the suite was green.
    expect(dom.querySelector('p')).not.toBeNull()
    handle.destroy()
  })

  test('Enter starts a new paragraph, and that is a blank line in the grammar', () => {
    const handle = createRichTextEditor({ value: 'one' })
    handle.editor.commands.focus('end')
    handle.editor.commands.splitBlock()
    handle.editor.commands.insertContent('two')

    const after = handle.value()
    handle.destroy()

    // A blank line IS the block separator in this grammar, so two paragraphs
    // round-trip as one blank line between them.
    expect(after).toBe('one\n\ntwo')
  })

  test('typing into an empty editor produces the text, not nothing', () => {
    const handle = createRichTextEditor({ value: '' })
    handle.editor.commands.insertContent('hello')

    const after = handle.value()
    handle.destroy()

    expect(after).toBe('hello')
  })

  test('several paragraphs survive a round trip in order', () => {
    const handle = createRichTextEditor({ value: 'one\n\ntwo\n\nthree' })

    const after = handle.value()
    handle.destroy()

    expect(after).toBe('one\n\ntwo\n\nthree')
  })
})

describe('the toolbar commands the host actually calls', () => {
  /*
   * `run` is a chain of `else if`, one branch per button, and until now a single test
   * exercised one of them through the editor's own API rather than through `run`. A
   * branch that toggled the wrong thing — bold under the italic button, a bullet list
   * under the ordered one — would have produced a green suite and a toolbar that lies.
   *
   * Each case selects the whole document first, because a command with nothing to apply
   * to silently does nothing, which is the failure the `focus()` in `run` exists for and
   * is indistinguishable from a wrong branch.
   */
  const withSelection = (value: string) => {
    const handle = createRichTextEditor({ value })
    handle.editor.commands.selectAll()
    return handle
  }

  test.each([
    ['strong', 'hello', '**hello**'],
    ['emphasis', 'hello', '*hello*'],
    ['bulletList', 'hello', '- hello'],
    ['orderedList', 'hello', '1. hello'],
  ])('%s produces the grammar it is named for', (command, value, expected) => {
    const handle = withSelection(value)

    handle.run(command as RichCommand)
    const after = handle.value()
    handle.destroy()

    expect(after).toBe(expected)
  })

  test('link takes the href it is given, and unlink takes it away', () => {
    // Both halves in one case, because the second is only meaningful over the first:
    // `unsetLink` on text that carries no link is a command that cannot be seen to work.
    const handle = withSelection('formancy')

    handle.run('link', 'https://formancy.ai')
    const linked = handle.value()
    handle.editor.commands.selectAll()
    handle.run('link')
    const unlinked = handle.value()
    handle.destroy()

    expect(linked).toBe('[formancy](https://formancy.ai)')
    expect(unlinked).toBe('formancy')
  })

  test('an empty href unlinks rather than linking to nowhere', () => {
    // The failure this prevents: a link dialog submitted empty writing `[text]()`, which
    // is a link to the current page in every renderer that reads it.
    const handle = withSelection('formancy')
    handle.run('link', 'https://formancy.ai')
    handle.editor.commands.selectAll()

    handle.run('link', '')
    const after = handle.value()
    handle.destroy()

    expect(after).toBe('formancy')
  })

  test('says which commands are active, for a mark and for a block alike', () => {
    // A toolbar reads this to decide which buttons look pressed. `isActive` looks a
    // command up in two maps and returns false when neither has it, so a command in
    // neither map is a button that never lights up.
    const handle = withSelection('hello')

    expect(handle.isActive('strong')).toBe(false)
    handle.run('strong')
    expect(handle.isActive('strong')).toBe(true)
    expect(handle.isActive('emphasis')).toBe(false)

    handle.editor.commands.selectAll()
    handle.run('bulletList')
    expect(handle.isActive('bulletList')).toBe(true)
    expect(handle.isActive('orderedList')).toBe(false)

    handle.destroy()
  })

  test('answers isActive for EVERY command the grammar has', () => {
    // The list is written out because a TypeScript union is not enumerable at runtime.
    // What keeps it honest is the map `isActive` reads: it is keyed by `RichCommand`, so
    // a sixth command fails to compile until it has an entry, and this case then fails
    // until it is listed here too.
    const handle = withSelection('hello')

    for (const command of ['strong', 'emphasis', 'link', 'bulletList', 'orderedList'] as const) {
      expect(typeof handle.isActive(command), command).toBe('boolean')
    }
    handle.destroy()
  })

  test('setValue replaces the answer without reporting an edit', () => {
    // `emitUpdate: false` is the point: loading a value that read back as somebody
    // having typed would mark a pristine form dirty, and a host that warns before
    // navigating away would warn on every form it opened.
    const seen: string[] = []
    const handle = createRichTextEditor({ value: 'first', onChange: (v) => seen.push(v) })

    handle.setValue('second')
    const after = handle.value()
    handle.destroy()

    expect(after).toBe('second')
    expect(seen).toEqual([])
  })
})
