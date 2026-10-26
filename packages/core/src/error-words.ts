import type { FieldDef } from '@formancy/spec'
import type { BuiltInErrorCode } from './error-codes.js'
import type { FormText, FormWordId, FormWordValues } from './words.js'

/**
 * What a field says for one of its error codes, in the reader's language (0191).
 *
 * **The catalogue words it**, because the alternatives each had a gap. The document cannot
 * — a sentence per code per form is a spec change and work for every author — and leaving
 * it to the host left every host that did nothing showing `required, minLength`. The
 * renderers' catalogue is already read in the form's language and already takes a host's
 * changes word by word, so an error is said exactly as a button is.
 *
 * **One function both renderers call**, so React and Angular cannot word the same error two
 * ways, and with the field's own limit in the sentence: "Enter at least 5 characters", not
 * "too short", because the field knows what would be right.
 *
 * A code the catalogue does not know is said as itself. That is a `validate` rule's own
 * `code`, or the message its expression returned, and either is the author's word.
 */
export function errorSentence(text: FormText, def: FieldDef | undefined, code: string): string {
  if (!Object.hasOwn(WORDED, code)) return code
  const locale = text.locale === '' ? 'en-GB' : text.locale
  const { id, values } = WORDED[code as BuiltInErrorCode](def, locale)
  return text(id, values)
}

type Worded = (def: FieldDef | undefined, locale: string) => { id: FormWordId; values?: FormWordValues }

const said = (id: FormWordId): Worded => () => ({ id })

/** What a list field holds more or fewer of: rows, files, or choices. */
const counted =
  (bound: 'minItems' | 'maxItems'): Worded =>
  (def) => {
    const of = def?.type === 'repeater' ? 'rows' : def?.type === 'file' ? 'files' : 'choices'
    return { id: `error.${bound}.${of}`, values: count(def?.[bound]) }
  }

/** A `Record` over the engine's codes: one added without a sentence does not build. */
const WORDED: Record<BuiltInErrorCode, Worded> = {
  // A required tick box is a consent gate: unticked is an answer, and only a tick will do. A
  // required repeater is answered by a row, and a required file field by a file.
  required: (def) => ({
    id:
      def?.type === 'checkbox'
        ? 'error.required.checkbox'
        : def?.type === 'repeater'
          ? 'error.required.rows'
          : def?.type === 'file'
            ? 'error.required.files'
            : 'error.required',
  }),
  invalid: said('error.invalid'),
  check_unavailable: said('error.check_unavailable'),
  type: said('error.type'),
  option: said('error.option'),
  duplicate: said('error.duplicate'),
  row: said('error.row'),
  min: (def, locale) => ({ id: 'error.min', values: number('min', def?.min, locale) }),
  max: (def, locale) => ({ id: 'error.max', values: number('max', def?.max, locale) }),
  step: (def, locale) => ({ id: 'error.step', values: number('step', def?.step, locale) }),
  minLength: (def) => ({ id: 'error.minLength', values: count(def?.minLength) }),
  maxLength: (def) => ({ id: 'error.maxLength', values: count(def?.maxLength) }),
  pattern: said('error.pattern'),
  mask: said('error.mask'),
  email: said('error.email'),
  url: said('error.url'),
  uuid: said('error.uuid'),
  shape: (def) => ({ id: 'error.shape', values: def === undefined ? {} : { format: STORED_FORM[def.type] ?? '' } }),
  earliest: (def, locale) => ({ id: 'error.earliest', values: moment('earliest', def, locale) }),
  latest: (def, locale) => ({ id: 'error.latest', values: moment('latest', def, locale) }),
  minItems: counted('minItems'),
  maxItems: counted('maxItems'),
  maxFileSize: (def, locale) => ({
    id: 'error.maxFileSize',
    values: def?.maxFileSize === undefined ? {} : { maxFileSize: bytes(def.maxFileSize, locale) },
  }),
  // A list, so the message's language joins it: ".pdf and image/*", ".pdf und image/*".
  accept: (def) => ({ id: 'error.accept', values: def?.accept === undefined ? {} : { accept: def.accept } }),
  box: said('error.box'),
  maxPoints: said('error.maxPoints'),
}

/** The form a temporal answer is typed in, which is the form `shape` refuses another of. */
const STORED_FORM: Partial<Record<FieldDef['type'], string>> = {
  date: 'YYYY-MM-DD',
  time: 'HH:MM',
  datetime: 'YYYY-MM-DDTHH:MM:SSZ',
}

/** A bound left out of the document leaves its placeholder visible, as every word does. */
function count(value: number | undefined): FormWordValues {
  return value === undefined ? {} : { count: value }
}

function number(name: string, value: number | undefined, locale: string): FormWordValues {
  return value === undefined ? {} : { [name]: new Intl.NumberFormat(locale).format(value) }
}

/**
 * A date bound as the reader writes a date — "3 May 2027", "3. Mai 2027" — and a time or an
 * instant as stored, since a wall clock reads the same everywhere and an instant would need a
 * zone the reader may not be in.
 */
function moment(name: 'earliest' | 'latest', def: FieldDef | undefined, locale: string): FormWordValues {
  const value = def?.[name]
  if (value === undefined) return {}
  if (def?.type !== 'date') return { [name]: value }
  const date = new Date(`${value}T00:00:00Z`)
  return { [name]: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date) }
}

/** A size in the largest unit that keeps it at one or more, counted in thousands as a disk is. */
function bytes(value: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let amount = value
  let unit = 0
  while (amount >= 1000 && unit < units.length - 1) {
    amount /= 1000
    unit += 1
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: units[unit], maximumFractionDigits: 1 }).format(amount)
}
