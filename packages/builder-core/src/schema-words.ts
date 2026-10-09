import { FIELD_TYPES, WIDGETS_BY_FIELD_TYPE } from '@formancy/spec'
import { createBuilderText } from './messages.js'
import { paletteEntries } from './palette.js'
import { editableLayoutPropertiesFor, editablePropertiesFor, layoutKinds } from './properties.js'

/**
 * Every one of the spec's own words a builder can show: each property's title and
 * description, for every field type and widget and every layout kind, and each
 * field type's name and what it is for.
 *
 * Read off the spec's JSON Schema rather than listed, because the schema is where
 * those words live — the reference documentation reads them from the same place —
 * and a list written here would go stale the day a property was added or
 * reworded. A translation of them is complete when it covers every text this
 * returns, and `schema-words.test.ts` holds each shipped language to that
 * ([0121](../../../docs/decisions/0121-the-specs-words-are-translated-beside-it.md)).
 */
export function schemaTexts(): string[] {
  const english = createBuilderText()
  const texts = new Set<string>()
  const add = (words: { title: string; description: string }): void => {
    texts.add(words.title)
    if (words.description !== '') texts.add(words.description)
  }

  const widgets = WIDGETS_BY_FIELD_TYPE as Readonly<Record<string, readonly string[]>>
  for (const type of FIELD_TYPES) {
    for (const widget of [undefined, ...(widgets[type] ?? [])]) {
      editablePropertiesFor(type, widget, english).forEach(add)
    }
  }
  for (const kind of layoutKinds()) editableLayoutPropertiesFor(kind, english).forEach(add)
  paletteEntries(undefined, english).forEach(add)

  return [...texts]
}
