/**
 * What the playground calls the buttons it draws beside its fields (0237), in each language the
 * starter form speaks, for both renderers. A host names its own buttons, so the renderer has no
 * word for them, and a host names them in the form's language, which the engine says: a button
 * called "Clear the country" beside a box labelled "Land" is a form half translated.
 */
export interface BesideWords {
  /** The Open beside the pickup point: by the point it opens, or for the field while none is chosen. */
  readonly open: (point: string | undefined) => string
  /** The Clear beside the country. */
  readonly clear: string
}

const ENGLISH: BesideWords = {
  open: (point) => (point === undefined ? 'Open the pickup point' : `Open ${point}`),
  clear: 'Clear the country',
}

const WORDS: Readonly<Record<string, BesideWords>> = {
  en: ENGLISH,
  de: {
    open: (point) => (point === undefined ? 'Abholort öffnen' : `${point} öffnen`),
    clear: 'Land löschen',
  },
  fr: {
    open: (point) => (point === undefined ? 'Ouvrir le point de retrait' : `Ouvrir ${point}`),
    clear: 'Effacer le pays',
  },
}

/** The words for the engine's locale, and English for a locale the playground has none for, as the form falls back. */
export function besideWords(locale: string): BesideWords {
  return WORDS[locale] ?? ENGLISH
}
