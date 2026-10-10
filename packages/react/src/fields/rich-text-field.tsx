import { useEffect, useRef, useState } from 'react'
import { applyRichCommand } from '@formancy/spec'
import type { RichCommand } from '@formancy/spec'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { RichText } from '../rich-text.js'
import { useRichTextEditorFactory } from '../rich-text-editor.js'
import type { RichTextEditorFactory, RichTextEditorHandle } from '../rich-text-editor.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'


/**
 * The rich text control, over a stored grammar rather than HTML.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * Formatted text, written as the restricted markup the spec defines.
 *
 * A textarea, not a contenteditable surface. That is a deliberate v1 cut and
 * not laziness: a WYSIWYG editor is a large accessibility surface of its own
 * — keyboard shortcuts, an announced selection model, focus management
 * inside a rich region — and shipping a half-built one is worse than
 * shipping a textarea that works with every assistive technology already.
 *
 * What the reader types is never treated as markup by anything. It is parsed
 * into a typed tree and rendered as elements, so there is no path from an
 * answer to `innerHTML` and no sanitiser to keep correct forever.
 */
/**
 * The rich text toolbar.
 *
 * A row of buttons over a textarea, not a contenteditable surface. That is the
 * deliberate choice — see `@formancy/spec`'s `richtext-edit` for why — and
 * it is what makes this editor cheap to make correct: the control is a plain
 * `<textarea>` that every assistive technology already knows, and the buttons
 * are ordinary buttons that do string arithmetic.
 *
 * The ARIA toolbar pattern, which means ONE tab stop for the whole row and
 * arrow keys within it. Five buttons that each take a tab press would put five
 * stops between a keyboard user and the box they came to type in.
 */
export function RichTextToolbar({
  disabled,
  label,
  onCommand,
}: {
  disabled: boolean
  /** The field's name, which is always a string: a field with no label is named by its path. */
  label: string
  onCommand: (command: RichCommand, href?: string) => void
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const [active, setActive] = useState(0)
  const text = useFormText()

  // Each button's name is the form's word for its command (0171); the glyph is decoration.
  const commands: ReadonlyArray<{ command: RichCommand; glyph: string }> = [
    { command: 'strong', glyph: 'B' },
    { command: 'emphasis', glyph: 'I' },
    { command: 'link', glyph: '↗' },
    { command: 'bulletList', glyph: '•' },
    { command: 'orderedList', glyph: '1.' },
  ]

  const move = (to: number): void => {
    const index = (to + commands.length) % commands.length
    setActive(index)
    buttons.current[index]?.focus()
  }

  return (
    <div
      role="toolbar"
      // Named with the field, because a form may have several of these and
      // "toolbar" five times tells a screen-reader user nothing about which
      // question they are formatting the answer to.
      aria-label={text('richtext.toolbar', { label })}
      data-formancy-part="richtext-toolbar"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          move(active + 1)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          move(active - 1)
        } else if (event.key === 'Home') {
          event.preventDefault()
          move(0)
        } else if (event.key === 'End') {
          event.preventDefault()
          move(commands.length - 1)
        }
      }}
    >
      {commands.map((entry, index) => (
        <button
          key={entry.command}
          ref={(element) => {
            buttons.current[index] = element
          }}
          type="button"
          disabled={disabled}
          // The roving tabindex: one stop for the row, arrows within it.
          tabIndex={index === active ? 0 : -1}
          data-formancy-part="richtext-button"
          onFocus={() => setActive(index)}
          onClick={() => {
            // A link needs an address, and a prompt is the honest version of
            // asking for one without building a dialog this package would
            // then own the accessibility of. A host wanting its own can
            // replace the whole field through the component registry.
            if (entry.command === 'link') {
              const href = window.prompt(text('richtext.linkAddress'))
              if (href === null || href === '') return
              onCommand('link', href)
              return
            }
            onCommand(entry.command)
          }}
        >
          {/* The glyph is decoration; the button's name is the word. */}
          <span aria-hidden="true">{entry.glyph}</span>
          <span data-formancy-part="visually-hidden">{text(`richtext.${entry.command}`)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The host's editor, mounted over the same value the textarea would have edited.
 *
 * Mounted once and fed afterwards, rather than re-created when the value
 * changes: a contenteditable rebuilt on every keystroke loses the caret, the
 * selection and the undo stack, which is the difference between an editor and a
 * box that fights you.
 *
 * What crosses the boundary is the stored grammar in both directions, never
 * markup ([0061](../../../docs/decisions/0061-tiptap-over-the-closed-grammar.md)).
 */
export function MountedRichText({
  field,
  value,
  make,
  onReady,
}: {
  field: ReturnType<typeof useField>
  value: string
  make: RichTextEditorFactory
  onReady: (handle: RichTextEditorHandle | undefined) => void
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const handle = useRef<RichTextEditorHandle | undefined>(undefined)
  // The value at mount time, read through a ref so the mount effect does not
  // depend on it and therefore does not re-run when it changes.
  const opening = useRef(value)
  const commit = useRef(field.setValue)
  commit.current = field.setValue

  useEffect(() => {
    const element = host.current
    if (element === null) return undefined

    const editor = make({
      element,
      value: opening.current,
      onChange: (next) => commit.current(next),
      editable: field.disabled !== true,
      // The engine owns the ids and the describedby composition, so they are
      // passed in rather than invented here. `aria-labelledby` rather than a
      // `<label for>`: the surface is a div, and `for` does not reach one.
      attributes: {
        ...(field.controlProps['aria-describedby'] === undefined
          ? {}
          : { 'aria-describedby': field.controlProps['aria-describedby'] }),
        ...(field.controlProps['aria-invalid'] === undefined
          ? {}
          : { 'aria-invalid': 'true' }),
        ...(field.controlProps['aria-required'] === undefined
          ? {}
          : { 'aria-required': 'true' }),
        'aria-labelledby': field.labelProps.id,
        id: field.controlProps.id,
        // The editing surface is a CHILD of the mount point, so it is the
        // element a theme has to style. Named here rather than left as the
        // editor library's own class, so a theme is not coupled to TipTap.
        'data-formancy-part': 'richtext-surface',
      },
    })

    handle.current = editor
    onReady(editor)
    return () => {
      editor.destroy()
      handle.current = undefined
      onReady(undefined)
    }
    // Mount once. Everything that changes afterwards is pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [make])


  useEffect(() => {
    const editor = handle.current
    if (editor === undefined) return
    // Only when the form changed the value from somewhere else — a calculation,
    // a draft being resumed, a reset. Comparing first is what stops the editor
    // resetting its own caret on every keystroke it just reported.
    if (editor.value() === value) return

    // And never while the person is in the editor.
    //
    // Without this the editor reverts its own change. Pressing Bold updates the
    // document, reports the new answer, and React re-renders — but for one
    // render `value` is still the answer from BEFORE the command. That render
    // reaches here, sees a difference, and pushes the stale answer back, which
    // un-bolds the word and then reports THAT.
    //
    // A value arriving from elsewhere while somebody is typing is rare; losing
    // what they just did is not recoverable. So the sync waits for them to leave,
    // and the comparison above catches it then.
    if (host.current?.contains(document.activeElement) === true) return

    editor.setValue(value)
  }, [value])

  return (
    <div
      data-formancy-part="richtext-editor"
      ref={host}
      onBlur={() => field.touch()}
    />
  )
}

export function RichTextField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const value = typeof field.value === 'string' ? field.value : ''
  const box = useRef<HTMLTextAreaElement | null>(null)
  const make = useRichTextEditorFactory()
  // State rather than a ref: the toolbar has to re-render once the editor
  // exists, or its buttons are wired to nothing on the first paint.
  const [editor, setEditor] = useState<RichTextEditorHandle | undefined>(undefined)

  /**
   * Run a toolbar command against the live selection and put the caret back.
   *
   * The selection is restored in an effect-free way {@link queueMicrotask}
   * would not guarantee: React has to have written the new value first, so
   * the box is updated on the next frame rather than immediately. An editor
   * that drops the caret to the end after every button is one nobody can use
   * for a second word.
   */
  const run = (command: RichCommand, href?: string): void => {
    const element = box.current
    if (element === null) return

    const next = applyRichCommand(
      command,
      { value, start: element.selectionStart, end: element.selectionEnd },
      href === undefined ? {} : { href },
    )
    field.setValue(next.value)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.start, next.end)
    })
  }

  if (make !== undefined) {
    // The toolbar stays. An editor library brings keyboard shortcuts and no
    // toolbar UI, so leaving ours out made Bold reachable by Ctrl+B and by no
    // visible control — worse than the textarea it replaced. One toolbar drives
    // either surface, over the same `RichCommand` values, so the two cannot come
    // to offer different things.
    //
    // No preview, though: the surface IS the preview, which is the whole reason
    // somebody wanted this.
    return (
      <FieldShell path={path} field={field} label={label}>
        <RichTextToolbar
          disabled={field.disabled}
          label={label}
          onCommand={(command, href) => editor?.run(command, href)}
        />
        <MountedRichText field={field} value={value} make={make} onReady={setEditor} />
      </FieldShell>
    )
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <RichTextToolbar
        disabled={field.disabled}
        label={label}
        onCommand={run}
      />
      <textarea
        {...field.controlProps}
        ref={box}
        rows={5}
        value={value}
        onKeyDown={(event) => {
          // The two shortcuts every editor has. Nothing else is bound: a
          // surprise binding in a form field is worse than no binding.
          if (!(event.ctrlKey || event.metaKey)) return
          const command =
            event.key.toLowerCase() === 'b'
              ? 'strong'
              : event.key.toLowerCase() === 'i'
                ? 'emphasis'
                : undefined
          if (command === undefined) return
          event.preventDefault()
          run(command)
        }}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
      {/* What the stored answer will look like, from the same parser the form
          that displays it will use. Not decoration: the grammar is small
          enough that a preview is how somebody learns it. */}
      <div data-formancy-part="richtext-preview" aria-live="off">
        <RichText source={value} />
      </div>
    </FieldShell>
  )
}
