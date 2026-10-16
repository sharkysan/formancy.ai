import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { FORM_WORDS, optionsStatus } from '@formancy/core/words'
import type { FormText, FormWordId, OptionsStatusState } from '@formancy/core/words'

/**
 * The table on the *Lists from a source* page, held to what each control says.
 *
 * It quotes the shipped English by hand, one sentence per state and control, and prose does
 * not break: when the withheld sentence was reworded from "One more cannot be chosen here."
 * — false over a page that withholds every row it matched — nothing would have failed while
 * the page went on quoting the old one. So each row's state is handed to `optionsStatus`,
 * which decides the sentence for both renderers (0177), and the cell is held to the message
 * it chose, with any number in a placeholder's place. Which sentence a row shows is read off
 * the decision, never matched against a phrase, so a cell under the wrong control fails too.
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, 'content', 'docs', 'concepts', 'options-sources.md'), 'utf8')

/** Each row's state, by the label in its first cell. A row added to the page is added here. */
const STATES: Record<string, Partial<OptionsStatusState>> = {
  'The source failed, or its answer was refused': { failed: true },
  "Under the source's minimum": { needs: 3 },
  'A page that goes on': { completeness: { kind: 'more', shown: 6 } },
  'Every row, cut by the control': { completeness: { kind: 'capped', shown: 50, total: 120 } },
  'Rows withheld, and nothing else left out': { completeness: { kind: 'withheld', withheld: 1 } },
  'Searching, with nothing above standing': { busy: true },
}

const settled: OptionsStatusState = {
  control: 'typeahead',
  open: true,
  disabled: false,
  failed: false,
  busy: false,
  needs: 0,
  query: '',
  completeness: { kind: 'complete' },
}

/** Which message the decision picks, recorded rather than worded. */
function chosen(state: OptionsStatusState): FormWordId {
  let id: FormWordId | undefined
  const recording: FormText = Object.assign(
    (picked: FormWordId): string => {
      id = picked
      return picked
    },
    { locale: 'en' },
  )
  optionsStatus(recording, state)
  if (id === undefined) throw new Error(`nothing is said in ${JSON.stringify(state)}`)
  return id
}

/** Every form of an English message, as a pattern whose placeholders take any number. */
function says(id: FormWordId): RegExp[] {
  const message: string | Record<string, string> = FORM_WORDS[id]
  const forms = typeof message === 'string' ? [message] : Object.values(message)
  return forms.map((form) => {
    const literal = form.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(`^${literal.join('\\d+')}$`)
  })
}

/** The table's body rows, as cells, under the section that holds it. */
function rows(): string[][] {
  const section = page.split('## What each control says, and when')[1]?.split('\n## ')[0] ?? ''
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
}

describe('the page about lists from a source', () => {
  test('names every state its table has, and its table every state named here', () => {
    // A row the map does not know would be quoted with nothing holding it.
    expect(rows().map((cells) => cells[0])).toEqual(Object.keys(STATES))
  })

  test.each(rows().map((cells) => [cells[0]!, cells[1]!, cells[2]!] as const))(
    '%s: says what each control says',
    (label, typeahead, select) => {
      const state = STATES[label]!
      const typeaheadSays = chosen({ ...settled, ...state, control: 'typeahead' })
      const selectSays = chosen({ ...settled, ...state, control: 'select' })
      expect(says(typeaheadSays).some((pattern) => pattern.test(typeahead)), `${typeaheadSays}: ${typeahead}`).toBe(true)
      expect(says(selectSays).some((pattern) => pattern.test(select)), `${selectSays}: ${select}`).toBe(true)
    },
  )
})
