/*
 * Whether a field shows a character count (0203): a text or a long text field with a
 * `maxLength` — the ones a person types plain text into, not rich text, whose length counts its
 * markup. Asked by the engine, which names the count in `aria-describedby`, and by
 * `countSentence`, which says it; a module of its own with nothing to import, so the words entry
 * shares it with the engine without sharing the engine's props.
 */
const COUNTED_FIELD_TYPES: ReadonlySet<string> = new Set(['text', 'textarea'])

export const showsCount = (def: { type: string; maxLength?: number | undefined }): boolean =>
  COUNTED_FIELD_TYPES.has(def.type) && def.maxLength !== undefined
