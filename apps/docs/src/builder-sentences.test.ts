import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

/**
 * Every sentence this package says to a person comes from the catalogue.
 *
 * **The defect this exists for.** The first change that moved the builder's words
 * into the catalogue said it had moved "every refusal a session issues". Four
 * were still English in `session.ts`, and `repath.ts` built an English clause that
 * was set into a German refusal — so a German author renaming a field read half a
 * sentence in each language. A refusal is the one sentence a person most needs to
 * understand, and nothing could notice: the catalogue's tests check the catalogue,
 * and a refusal only appears when something is refused.
 *
 * So this reads the source, not the wording: every string and template in the
 * package, parsed by the TypeScript compiler rather than matched by a pattern that
 * knows one spelling of a string. A literal that reads as a sentence — three words
 * in a row — is a sentence written into code, and it is named here
 * ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
const here = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'builder-core',
  'src',
)

/**
 * The files whose sentences are not the builder's to put in the catalogue, with
 * the reason. Read: a file on this list may say anything.
 *
 * The catalogues are not on it: they are found by what they are — see
 * `isCatalogue` — so a language added tomorrow is exempt without being listed.
 */
const SPEAKS_FOR_ITSELF: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'authoring.ts',
    why: 'Instructions to a model. The model is asked in English whatever the author speaks, because that is the language its answers are checked against — and the problems it is told are shown to the author as they were told, so a person reads exactly what the model was asked to fix.',
  },
]

/**
 * Whether a file is a catalogue: it exports a constant that `satisfies` a record of
 * messages. Read off the syntax tree, the shape the compiler checks, rather than
 * off a file name a translator might choose differently.
 */
function isCatalogue(file: string): boolean {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(here, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  let found = false
  const visit = (node: ts.Node): void => {
    if (
      ts.isSatisfiesExpression(node) &&
      /^Record<\w+, Message>$/.test(node.type.getText(source))
    ) {
      found = true
    }
    // The spec's words beside the schema (0121): a constant typed as SchemaWords.
    if (ts.isVariableDeclaration(node) && node.type?.getText(source) === 'SchemaWords') found = true
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** Three words in a row: a sentence, or the start of one. */
const SENTENCE = /[A-Za-z]{2,}[,;:]?\s+[A-Za-z]{2,}[,;:]?\s+[A-Za-z]{2,}/

function sentencesIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(here, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    // A thrown Error is for whoever called this package wrongly — a broken
    // invariant no correct caller reaches — not for the person building, and the
    // builders never show one. Skipped by where it stands, not by what it says.
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Error'
    )
      return
    const pieces: string[] = []
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) pieces.push(node.text)
    if (ts.isTemplateExpression(node)) {
      pieces.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text))
    }
    for (const piece of pieces) {
      if (SENTENCE.test(piece)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
        found.push(`${file}:${String(line)} ${JSON.stringify(piece.slice(0, 60))}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('a sentence this package says to a person', () => {
  const exempt = new Set(SPEAKS_FOR_ITSELF.map((entry) => entry.file))
  const sources = readdirSync(here).filter(
    (name: string) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  )
  const catalogues = sources.filter(isCatalogue)
  const files = sources.filter((name) => !exempt.has(name) && !catalogues.includes(name))

  test('comes from the catalogue, never from a literal in the code', () => {
    expect(files.flatMap(sentencesIn)).toEqual([])
  })

  test('and the check reads the files it claims to', () => {
    // A check of absence is satisfied by one that read nothing. session.ts is
    // where the refusals live; it has to be among the files read.
    expect(files).toContain('session.ts')
    expect(files.length).toBeGreaterThan(20)
    // And finds the catalogues by what they are: English and every shipped language.
    expect(catalogues).toEqual(
      expect.arrayContaining([
        'messages.ts',
        'messages-de.ts',
        'messages-fr.ts',
        'schema-words-de.ts',
        'schema-words-fr.ts',
      ]),
    )
  })

  test('and the files allowed to speak for themselves exist and say why', () => {
    for (const entry of SPEAKS_FOR_ITSELF) {
      expect(readdirSync(here), entry.file).toContain(entry.file)
      expect(entry.why.length).toBeGreaterThan(10)
    }
  })
})
