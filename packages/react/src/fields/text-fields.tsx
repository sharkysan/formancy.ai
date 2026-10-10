import { useState } from 'react'
import { answerFromText, editMasked, formatMasked, maskIsNumeric, maskPlaceholder } from '@formancy/spec'
import { useFormText } from '../context.js'
import { useField } from '../use-field.js'
import { useScanner } from '../scanning.js'
import { FieldShell } from './internals.js'
import type { FieldComponentProps } from './internals.js'


/**
 * The controls that take typed text, and the widgets over them.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 2,154-line file — the largest in the repository.
 */
/**
 * A single-line answer, and — with `widget: "scanner"` — a camera route to the same
 * string.
 *
 * The input is the control in both cases, never a second one beside it: typing is
 * the accessibility floor and the fallback at once, so it is what is always there
 * and the scan button is what is sometimes added. With no scanner supplied the
 * markup is the default control exactly, because a Scan button that opens nothing is
 * worse than no button ([0071](../../../docs/decisions/0071-a-scanner-is-supplied-not-built.md)).
 */
export function TextField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  const scan = useScanner()
  const words = useFormText()
  const [scanning, setScanning] = useState(false)
  /**
   * A device failure, held here rather than in the field's errors. See below. What went
   * wrong rather than a sentence about it, so the sentence is the form's language's.
   */
  const [trouble, setTrouble] = useState<{ reason?: string } | undefined>(undefined)

  /**
   * The ONE place a text field's answer is written, typed or scanned.
   *
   * Structural rather than careful: the parameter is a `string`, so there is no path
   * from the camera to `setValue` that could store something typing could not. That
   * is the line a widget may never cross — it changes how a field looks, never what
   * it collects ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
   */
  const commit = (text: string): void =>
    // `<input type="text">` runs the platform's value sanitiser on everything that reaches
    // it -- "strip newlines from the value", in HTML's value sanitization algorithm -- so a
    // typed or pasted answer can never hold CR or LF. A scanned code CAN: a Wi-Fi or vCard
    // payload is several lines. Applying the control's own rule here is what makes a scanned
    // answer byte-identical to a typed one rather than merely similar, which is the line a
    // widget may not cross
    // ([0065](../../../docs/decisions/0065-a-widget-is-authored-not-registered.md)).
    //
    // Not a second validator -- `pattern` stays the engine's -- and not taste: jsdom does
    // not implement the sanitiser either, so nothing here notices unless it is asserted.
    field.setValue(text.replace(/[\r\n]/g, ''))

  /*
   * With a mask, the control shows the answer in its shape and the answer holds only
   * what was typed into the positions. Where a typed, deleted or pasted character
   * lands is `editMasked`'s, in `@formancy/spec`, which the Angular binding calls too —
   * two answers to one keystroke would be the drift 0091 exists to prevent (0125).
   */
  const mask = field.def.mask
  const answer = typeof field.value === 'string' ? field.value : ''
  const shown = mask === undefined ? answer : formatMasked(mask, answer)

  const read = async (): Promise<void> => {
    // Re-entrancy, which `disabled` used to prevent: a second press while a scan is in
    // flight is ignored rather than opening a second camera session.
    if (scan === undefined || scanning) return
    setScanning(true)
    setTrouble(undefined)
    try {
      const text = await scan({ label, path })
      // Nobody scanned anything: the sheet was closed, or they changed their mind.
      // Not a failure, and an apology in a live region for a decision somebody made
      // on purpose is noise.
      if (text === null) return
      if (typeof text !== 'string') {
        // A host written in plain JavaScript can resolve with anything. Reported as
        // the device failure it is, rather than stored — an object in a text field
        // is exactly what `commit` exists to make impossible.
        setTrouble({})
        return
      }
      // Stored as typed, THEN touched — so a value the field's `pattern` refuses
      // shows the engine's own error rather than being dropped. Dropping it would
      // discard the only record of what the camera read and leave the field looking
      // empty, which is the worse of the two failures by some distance. A masked
      // field reads it the way it reads a paste.
      commit(mask === undefined ? text : answerFromText(mask, text))
      field.touch()
    } catch (error) {
      setTrouble({ reason: error instanceof Error ? error.message : String(error) })
    } finally {
      setScanning(false)
    }
  }

  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="text"
        {...field.controlProps}
        value={shown}
        // The shape as the hint, and a keypad when every position takes a digit.
        placeholder={mask === undefined ? undefined : maskPlaceholder(mask)}
        inputMode={mask !== undefined && maskIsNumeric(mask) ? 'numeric' : undefined}
        onChange={(event) => {
          if (mask === undefined) {
            commit(event.target.value)
            return
          }
          const input = event.target
          const forward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
          const edit = editMasked(mask, answer, input.value, {
            caret: input.selectionStart,
            direction: forward ? 'forward' : 'backward',
          })
          // Written to the control before React renders, so the caret can be placed in
          // the text it belongs to: React would write the same text a moment later and
          // leave the caret at its end. (A refused character React removes by itself,
          // restoring the controlled value — measured, not assumed.)
          input.value = formatMasked(mask, edit.answer)
          input.setSelectionRange(edit.caret, edit.caret)
          commit(edit.answer)
        }}
        onBlur={() => field.touch()}
      />
      {field.def.widget === 'scanner' && scan !== undefined ? (
        <>
          <button
            type="button"
            data-formancy-part="scanner-button"
            // Disabled only when the FIELD is. Disabling the button somebody just pressed
            // blurs it, and the browser then resets focus to `<body>` — so a keyboard user
            // who presses Scan is returned to the top of the document, and the status line
            // tells them to type the value instead into a field they now have to find again.
            //
            // Busy is said with `aria-busy`, which changes nothing about focus, and the guard
            // in `read` does what `disabled` was doing. Not testable here: jsdom does not
            // blur a focused element that becomes disabled, which is exactly why this was
            // written the other way round first.
            disabled={field.disabled}
            aria-busy={scanning ? true : undefined}
            onClick={() => {
              void read()
            }}
          >
            {/* The word is the visible label and the field's name completes the
                accessible one, so three scannable fields on a page do not offer
                three buttons called "Scan" — and the visible text is still
                contained in the accessible name (WCAG 2.5.3). */}
            {words('scanner.scan')} <span data-formancy-part="visually-hidden">{label}</span>
          </button>
          {/* The camera's own progress and its failures, in this field's polite
              region. NOT the error region: that one is the control's describedby
              target, it holds the engine's verdicts, and a refused permission put
              there would describe a hardware problem as a wrong answer. Same shape
              as the file field's status line, for the same reason. */}
          <p role="status" data-formancy-part="scanner-status">
            {scanning
              ? words('scanner.scanning')
              : trouble === undefined
                ? ''
                : trouble.reason === undefined
                  ? words('scanner.noText')
                  : words('scanner.failed', { reason: trouble.reason })}
          </p>
        </>
      ) : null}
    </FieldShell>
  )
}

export function TextareaField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <textarea
        {...field.controlProps}
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}

export function NumberField({ path, label }: FieldComponentProps) {
  const field = useField(path)
  return (
    <FieldShell path={path} field={field} label={label}>
      <input
        type="number"
        {...field.controlProps}
        value={typeof field.value === 'number' ? field.value : ''}
        onChange={(event) =>
          field.setValue(event.target.value === '' ? null : event.target.valueAsNumber)
        }
        onBlur={() => field.touch()}
      />
    </FieldShell>
  )
}
