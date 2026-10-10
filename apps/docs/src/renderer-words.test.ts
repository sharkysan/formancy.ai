import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

/**
 * Every word a renderer shows comes from the form's words, never from a literal in a binding.
 *
 * **The defect this exists for.** A form's questions are the author's, read through the
 * document's catalogue in the language the reader chose. The renderers' own words — Next,
 * Back, Submit, Remove, Cancel uploading, Try again, the error summary's heading, every
 * live region's announcement — were written as English literals in each binding, React,
 * Angular and Material separately, so a form in German asked its questions in German around
 * English buttons. Each new control added to them, and nothing could notice: a literal is
 * not a missing translation anybody's test asks for
 * ([0171](../../../docs/decisions/0171-the-renderers-words-are-the-forms-language.md)).
 *
 * So this reads the source, not the screen. The renderers' words are short — one word,
 * "Next", is a whole button — so the builder's rule, three words in a row
 * ([0119](../../../docs/decisions/0119-a-sentence-in-builder-core-comes-from-the-catalogue.md)),
 * would pass every one of them. The rule here is where a literal STANDS, read off the
 * compiler's syntax tree and off Angular's templates:
 *
 * - **On screen**: JSX text, an Angular template's text, and anything a text attribute —
 *   `aria-label`, `title`, `alt`, `placeholder` — or a JSX child expression or template
 *   interpolation puts there. Any letter there is a word.
 * - **In code**: a literal that reads as words — a word beside whitespace (`'Uploading '`,
 *   `` `${label} suggestions` ``), or one capitalised word (`'Bold'`, `'Tab '`). Code says
 *   `'data-state'` and `'aria-describedby'`, and those are neither.
 *
 * And what a literal is FOR decides the exceptions, never what it says: the argument of a
 * thrown error, an operand of a comparison, a `case` label, a CSS selector handed to the
 * DOM, a property's name, a type, an import.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const ROOTS = ['packages/react/src', 'packages/angular/src', 'packages/angular/material/src']

/** The attributes whose value a person reads or hears. */
const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-valuetext',
  'aria-roledescription',
  'aria-placeholder',
  'aria-description',
  'title',
  'alt',
  'placeholder',
])

/** DOM calls whose string argument is a CSS selector rather than a word. */
const SELECTOR_CALLS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches'])

const LETTER = /\p{L}/u
/** A word beside whitespace, either side: `'Uploading '`, `' of '`, `'Bulleted list'`. */
const WORD_BESIDE_SPACE = /\p{L}{2,}\s|\s\p{L}{2,}/u
/** One capitalised word and nothing else: `'Bold'`, `'Waiting'`. Not `'ArrowDown'`. */
const CAPITALISED_WORD = /^\p{Lu}\p{Ll}+[.…:!?]?$/u

/** Whether a literal standing in code reads as words. */
function readsAsWords(text: string): boolean {
  return WORD_BESIDE_SPACE.test(text) || CAPITALISED_WORD.test(text.trim())
}

type Place = 'screen' | 'code'

interface Found {
  readonly line: number
  readonly text: string
}

/** A literal's text, with a template's substitutions written as `{}`. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `{}${span.literal.text}`).join('')
  }
  return undefined
}

function isComparison(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.ExclamationEqualsToken
  )
}

function attributeName(name: ts.JsxAttributeName): string {
  return ts.isIdentifier(name) ? name.text : `${name.namespace.text}:${name.name.text}`
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return undefined
}

/**
 * The words in one expression or statement, walking it with where each part stands.
 *
 * `offset` is the line the parsed text starts on, for an expression lifted out of an
 * Angular template.
 */
function wordsIn(root: ts.Node, source: ts.SourceFile, offset = 0): Found[] {
  const found: Found[] = []
  const report = (node: ts.Node, text: string): void => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 + offset
    found.push({ line, text })
  }

  const visit = (node: ts.Node, place: Place): void => {
    // Not anybody's words: a module's name, a type, a broken invariant's message.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /Error$/.test(node.expression.text)
    ) {
      return
    }

    const text = literalText(node)
    if (text !== undefined) {
      if (place === 'screen' ? LETTER.test(text) : readsAsWords(text)) report(node, text)
      // A template's substitutions are code, whatever the template is for.
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) visit(span.expression, 'code')
      }
      return
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      // An element is not text because it stands where text could: its attributes say
      // where their values go, and its children where theirs do.
      ts.forEachChild(node, (child) => visit(child, 'code'))
      return
    }
    if (ts.isJsxText(node)) {
      if (LETTER.test(node.text)) report(node, node.text.trim())
      return
    }
    if (ts.isJsxExpression(node)) {
      // A child `{…}` puts what it evaluates to on screen; an attribute's does not.
      const child = ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)
      if (node.expression !== undefined) visit(node.expression, child ? 'screen' : 'code')
      return
    }
    if (ts.isJsxAttribute(node)) {
      const initializer = node.initializer
      if (initializer === undefined) return
      if (TEXT_ATTRIBUTES.has(attributeName(node.name))) {
        if (ts.isJsxExpression(initializer)) {
          if (initializer.expression !== undefined) visit(initializer.expression, 'screen')
        } else {
          visit(initializer, 'screen')
        }
      } else if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
        // `type="button"`, `data-formancy-part="…"`, `rel="…"`: a value for the browser.
        visit(initializer.expression, 'code')
      }
      return
    }

    if (ts.isPropertyAssignment(node)) {
      // `{ 'aria-label': … }` spread onto an element is the attribute by another route.
      const name = propertyName(node.name)
      visit(node.initializer, name !== undefined && TEXT_ATTRIBUTES.has(name) ? 'screen' : place)
      return
    }
    if (ts.isBinaryExpression(node) && isComparison(node.operatorToken.kind)) {
      // `event.key === 'Home'`, `entry.state === 'failed'`: a value compared, never shown.
      for (const side of [node.left, node.right]) {
        if (literalText(side) === undefined) visit(side, 'code')
      }
      return
    }
    if (ts.isCaseClause(node)) {
      if (literalText(node.expression) === undefined) visit(node.expression, 'code')
      for (const statement of node.statements) visit(statement, 'code')
      return
    }
    if (ts.isCallExpression(node)) {
      visit(node.expression, 'code')
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : undefined
      // What a function is handed is its argument, not the screen — `text('form.next')`.
      // A CSS selector handed to the DOM is not a word at all.
      for (const argument of node.arguments) {
        if (callee !== undefined && SELECTOR_CALLS.has(callee) && literalText(argument) !== undefined) continue
        visit(argument, 'code')
      }
      return
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, 'code')
      visit(node.whenTrue, place)
      visit(node.whenFalse, place)
      return
    }
    if (ts.isElementAccessExpression(node)) {
      visit(node.expression, place)
      visit(node.argumentExpression, 'code')
      return
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      ts.forEachChild(node, (child) => visit(child, 'code'))
      return
    }
    if (ts.isDecorator(node)) {
      visitDecorator(node)
      return
    }
    ts.forEachChild(node, (child) => visit(child, place))
  }

  /** `@Component({ selector, template, … })`: the selector is a tag; the template is read apart. */
  const visitDecorator = (node: ts.Decorator): void => {
    const call = node.expression
    if (!ts.isCallExpression(call)) return
    for (const argument of call.arguments) {
      if (!ts.isObjectLiteralExpression(argument)) {
        visit(argument, 'code')
        continue
      }
      for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property)) continue
        const name = propertyName(property.name)
        if (name === 'selector' || name === 'template') continue
        visit(property.initializer, 'code')
      }
    }
  }

  visit(root, 'code')
  return found
}

/** `source` with every span from `open` to the next `close` blanked, keeping its line breaks. */
function blank(source: string, open: string, close: string): string {
  let kept = ''
  let at = 0
  for (;;) {
    const start = source.indexOf(open, at)
    if (start < 0) return kept + source.slice(at)
    const end = source.indexOf(close, start + open.length)
    const stop = end < 0 ? source.length : end + close.length
    kept += source.slice(at, start) + source.slice(start, stop).replace(/[^\n]/g, ' ')
    at = stop
  }
}

/**
 * An Angular expression's words, parsed by the TypeScript compiler.
 *
 * A pipe's head is the pipe's argument, as a call's is — `'form.next' | formancyText` hands
 * an id to a function, and the pipe's own arguments are values too.
 */
function expressionWords(expression: string, place: Place, line: number): Found[] {
  const pipes = splitPipes(expression)
  const head = pipes[0] ?? ''
  const rest = pipes.slice(1)
  const pieces: Array<{ text: string; place: Place }> = [
    { text: head, place: rest.length > 0 ? 'code' : place },
    ...rest.flatMap((pipe) =>
      splitTopLevel(pipe, ':')
        .slice(1)
        .map((argument) => ({ text: argument, place: 'code' as Place })),
    ),
  ]
  return pieces.flatMap((piece) => {
    const parsed = ts.createSourceFile('expression.ts', `(${piece.text});`, ts.ScriptTarget.Latest, true)
    const statement = parsed.statements[0]
    if (statement === undefined || !ts.isExpressionStatement(statement)) return []
    const root = ts.isParenthesizedExpression(statement.expression)
      ? statement.expression.expression
      : statement.expression
    return wordsInExpression(root, parsed, piece.place, line - 1)
  })
}

function wordsInExpression(root: ts.Node, source: ts.SourceFile, place: Place, offset: number): Found[] {
  // Wrapped so the walk starts in the place the expression stands in.
  if (place === 'code') return wordsIn(root, source, offset)
  const found: Found[] = []
  const literal = literalText(root)
  if (literal !== undefined) {
    if (LETTER.test(literal)) found.push({ line: offset + 1, text: literal })
    return found
  }
  if (ts.isConditionalExpression(root)) {
    return [
      ...wordsIn(root.condition, source, offset),
      ...wordsInExpression(root.whenTrue, source, 'screen', offset),
      ...wordsInExpression(root.whenFalse, source, 'screen', offset),
    ]
  }
  if (ts.isBinaryExpression(root) && !isComparison(root.operatorToken.kind)) {
    return [
      ...wordsInExpression(root.left, source, 'screen', offset),
      ...wordsInExpression(root.right, source, 'screen', offset),
    ]
  }
  if (ts.isParenthesizedExpression(root)) return wordsInExpression(root.expression, source, place, offset)
  return wordsIn(root, source, offset)
}

/** `text` split on `separator` where it stands outside quotes, brackets and parentheses. */
function splitTopLevel(text: string, separator: string, skipDouble = false): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let start = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]!
    if (quote !== undefined) {
      if (char === quote && text[at - 1] !== '\\') quote = undefined
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === separator && depth === 0) {
      if (skipDouble && (text[at + 1] === separator || text[at - 1] === separator)) continue
      parts.push(text.slice(start, at))
      start = at + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

const splitPipes = (expression: string): string[] => splitTopLevel(expression, '|', true)

/** The line `index` falls on within `text`, counting from zero. */
const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length - 1

/**
 * The words in an Angular template: its text, its interpolations, and its text attributes,
 * static or bound. Control flow — `@if (…) {`, `} @else {`, `@case ('failed')` — is
 * structure, and its conditions are code.
 */
function templateWords(template: string, firstLine = 1): Found[] {
  const source = blank(template, '<!--', '-->')
  const found: Found[] = []
  let at = 0
  while (at < source.length) {
    const open = source.indexOf('<', at)
    const textEnd = open < 0 ? source.length : open
    found.push(...textWords(source.slice(at, textEnd), firstLine + lineAt(source, at)))
    if (open < 0) break
    const close = tagEnd(source, open)
    found.push(...tagWords(source.slice(open, close), firstLine + lineAt(source, open)))
    at = close
  }
  return found
}

/** Where a tag ends: the first `>` outside a quoted attribute value. */
function tagEnd(source: string, open: number): number {
  let quote: string | undefined
  for (let at = open + 1; at < source.length; at += 1) {
    const char = source[at]!
    if (quote !== undefined) {
      if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '>') return at + 1
  }
  return source.length
}

function tagWords(tag: string, line: number): Found[] {
  const found: Found[] = []
  for (const match of tag.matchAll(/([\w.:@[\]()*#-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const name = match[1]!
    const value = match[3] ?? match[4] ?? ''
    const where = line + lineAt(tag, match.index)
    const bound = /^\[(?:attr\.)?([\w-]+)\]$/.exec(name)?.[1]
    if (bound !== undefined) {
      if (TEXT_ATTRIBUTES.has(bound)) found.push(...expressionWords(value, 'screen', where))
      continue
    }
    if (TEXT_ATTRIBUTES.has(name) && LETTER.test(value)) found.push({ line: where, text: value })
  }
  return found
}

/** A text node's words, once interpolations are read and control flow is taken out. */
function textWords(text: string, line: number): Found[] {
  const found: Found[] = []
  let rest = ''
  let at = 0
  for (;;) {
    const open = text.indexOf('{{', at)
    if (open < 0) {
      rest += text.slice(at)
      break
    }
    const close = text.indexOf('}}', open)
    const end = close < 0 ? text.length : close
    rest += `${text.slice(at, open)} `
    found.push(...expressionWords(text.slice(open + 2, end), 'screen', line + lineAt(text, open)))
    at = end + 2
  }
  // `&times;`, `&uarr;`, Angular's `&ngsp;`: a character by name, not a word.
  const words = withoutControlFlow(rest).replace(/&(?:[a-z]+|#\d+|#x[\da-f]+);/gi, ' ')
  if (LETTER.test(words)) found.push({ line, text: words.replace(/\s+/g, ' ').trim() })
  return found
}

/** `@if (…) {`, `} @else if (…) {`, `@for (…; track …) {`, `@case ('x') {`, `}` taken out. */
function withoutControlFlow(text: string): string {
  let kept = ''
  let at = 0
  while (at < text.length) {
    const block = text.indexOf('@', at)
    if (block < 0) {
      kept += text.slice(at)
      break
    }
    kept += text.slice(at, block)
    let cursor = block + 1
    while (cursor < text.length && /[a-z ]/.test(text[cursor]!)) cursor += 1
    if (text[cursor] === '(') {
      let depth = 0
      for (; cursor < text.length; cursor += 1) {
        if (text[cursor] === '(') depth += 1
        if (text[cursor] === ')') depth -= 1
        if (depth === 0) {
          cursor += 1
          break
        }
      }
    }
    at = cursor
  }
  return kept.replace(/[{}]/g, ' ')
}

/** Every inline template a file declares, with the line it starts on. */
function templatesIn(source: ts.SourceFile): Array<{ text: string; line: number }> {
  const templates: Array<{ text: string; line: number }> = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === 'template' &&
      ts.isDecorator(node.parent.parent.parent)
    ) {
      const text = literalText(node.initializer)
      if (text !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.initializer.getStart(source)).line + 1
        templates.push({ text, line })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return templates
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name)) return []
    if (/\.(test|spec)\.tsx?$|\.d\.ts$|^test-setup\.ts$/.test(entry.name)) return []
    return [path]
  })
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

/** Every word written into one file, as `file:line "text"`. */
function literalWordsIn(path: string): string[] {
  const source = parse(path)
  const name = relative(repo, path)
  const found = [
    ...wordsIn(source, source),
    ...templatesIn(source).flatMap(({ text, line }) => templateWords(text, line)),
  ]
  return found
    .sort((a, b) => a.line - b.line)
    .map(({ line, text }) => `${name}:${String(line)} ${JSON.stringify(text.slice(0, 60))}`)
}

/** What the guard finds in a snippet, so its rules can be held to cases of their own. */
function inSnippet(code: string, kind: ts.ScriptKind = ts.ScriptKind.TSX): string[] {
  const source = ts.createSourceFile('snippet.tsx', code, ts.ScriptTarget.Latest, true, kind)
  return [
    ...wordsIn(source, source),
    ...templatesIn(source).flatMap(({ text, line }) => templateWords(text, line)),
  ].map(({ text }) => text)
}

const files = ROOTS.flatMap((root) => sourceFiles(join(repo, root)))

describe('a word a renderer shows', () => {
  test('comes from the form’s words, never from a literal in a binding', () => {
    expect(files.flatMap(literalWordsIn)).toEqual([])
  })

  test('and the check reads the files it claims to, templates included', () => {
    // A check of absence is satisfied by one that read nothing. The form is where Next,
    // Back and Submit are drawn in each binding, and Material's group draws its own hint.
    const names = files.map((path) => relative(repo, path))
    expect(names).toEqual(
      expect.arrayContaining([
        'packages/react/src/form.tsx',
        'packages/angular/src/form.ts',
        'packages/angular/material/src/choice-fields.ts',
      ]),
    )
    // Every Angular component's template is read, not only the first in a file.
    const templates = files.flatMap((path) => templatesIn(parse(path)))
    expect(templates.length).toBeGreaterThan(25)
  })
})

describe('the rules the guard reads by', () => {
  // Each case is a word that shipped in one binding or the other: a rule that stopped
  // finding it would pass the bindings while they said it again.
  test('finds a word on a button, in an attribute, in a child expression and in code', () => {
    expect(inSnippet('const a = <button type="button">Next</button>')).toEqual(['Next'])
    expect(inSnippet('const a = <nav aria-label="Progress" data-formancy-part="stepper" />')).toEqual([
      'Progress',
    ])
    expect(inSnippet("const a = <button>{label ?? 'Submit'}</button>")).toEqual(['Submit'])
    expect(inSnippet('const a = <ul aria-label={`${label} suggestions`} />')).toEqual(['{} suggestions'])
    expect(inSnippet("const status = () => (busy ? 'Searching…' : '')")).toEqual(['Searching…'])
    expect(inSnippet("const tools = [{ command: 'strong', name: 'Bold' }]")).toEqual(['Bold'])
    expect(inSnippet("const name = 'Uploading ' + entry.name")).toEqual(['Uploading '])
    expect(inSnippet("const a = <p {...{ 'aria-label': 'Chosen' }} />")).toEqual(['Chosen'])
  })

  test('and a word in an Angular template, static, bound or interpolated', () => {
    const template = (body: string): string =>
      `@Component({ selector: 'x-y', template: \`${body}\` }) class X {}`
    expect(inSnippet(template('<button (click)="next()">Next</button>'))).toEqual(['Next'])
    expect(inSnippet(template('<nav aria-label="Progress"></nav>'))).toEqual(['Progress'])
    expect(inSnippet(template('<li [attr.aria-label]="\'Move \' + name"></li>'))).toEqual(['Move '])
    expect(inSnippet(template('<span>{{ index }} of {{ count }}</span>'))).toEqual(['of'])
    expect(inSnippet(template("@if (busy) {<p>{{ busy ? 'Searching…' : '' }}</p>}"))).toEqual([
      'Searching…',
    ])
  })

  test('and leaves alone what is for the browser, the compiler or a comparison', () => {
    expect(inSnippet('const a = <div data-formancy-part="file-list" rel="noreferrer noopener" />')).toEqual([])
    expect(inSnippet("if (event.key === 'Home') move(0)")).toEqual([])
    expect(inSnippet("switch (key) { case 'End': break }")).toEqual([])
    expect(inSnippet("throw new Error('useWizard needs a schema with pages')")).toEqual([])
    expect(inSnippet("const first = root.querySelector('input, select, textarea, button')")).toEqual([])
    expect(inSnippet("const a = <button>{text('form.next')}</button>")).toEqual([])
    // An element inside a child expression keeps its attributes' places.
    expect(inSnippet("const a = <ul>{open ? <li {...(over ? { 'data-state': 'over' } : {})} /> : null}</ul>")).toEqual([])
    const template = `@Component({ selector: 'x-y', template: \`
      <!-- A comment says anything it likes. -->
      @if (entry.state === 'failed') {
        <button type="button">{{ 'form.retry' | formancyText: { name: entry.name } }}</button>
        <span aria-hidden="true">&times;&ngsp;</span>
      }
    \` }) class X {}`
    expect(inSnippet(template)).toEqual([])
  })
})
