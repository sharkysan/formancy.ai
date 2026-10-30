import { validateHeaderValue } from 'node:http'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import * as headerValues from './header-values.js'
import { attachment } from './header-values.js'

/**
 * A response header's value made from data
 * ([0175](../../../docs/decisions/0175-a-name-goes-into-a-header-encoded.md)).
 *
 * Node writes a header value only when every character in it is a tab, printable ASCII or a
 * byte from 0x80 to 0xFF, and throws `ERR_INVALID_CHAR` for anything else — after the route
 * has answered, while the reply is being written. A file's name is whatever its respondent
 * called it, and a form's path whatever its author typed, so a name like `日本 €.pdf`, or one
 * with U+0001 in it, made the download a `500`.
 */

/** A `content-disposition` this module writes, read back as RFC 6266 and RFC 8187 read it. */
function readBack(header: string): { fallback: string; name: string } {
  // Strict on purpose: the fallback holds no quote and no backslash, so it needs no
  // unescaping; the extended value holds only RFC 8187's attr-chars and percent-escapes.
  const parts = /^attachment; filename="([^"\\]*)"(?:; filename\*=UTF-8''((?:[A-Za-z0-9!#$&+\-.^_`|~]|%[0-9A-F]{2})*))?$/.exec(header)
  if (parts === null) throw new Error(`not a content-disposition this module writes: ${JSON.stringify(header)}`)
  const fallback = parts[1]!
  return { fallback, name: parts[2] === undefined ? fallback : decodeURIComponent(parts[2]) }
}

/** The name a header says, or nothing when it is not one this module writes. */
function readable(header: string): string | undefined {
  try {
    return readBack(header).name
  } catch {
    return undefined
  }
}

/** What UTF-8 can carry of `text`: a lone surrogate becomes U+FFFD, as `Buffer` writes it. */
function wellFormed(text: string): string {
  return Buffer.from(text, 'utf8').toString('utf8')
}

describe('a file offered for download under its own name', () => {
  test('in plain ASCII is the header it always was', () => {
    // A client, or a proxy rule, that reads the header this route always wrote for an ordinary
    // name finds it unchanged: the extended parameter is added only when the plain one lost
    // something.
    expect(attachment('notes.pdf')).toBe('attachment; filename="notes.pdf"')
  })

  test.each([
    // Outside Latin-1 altogether: Node refused the whole header, and the download was a 500.
    ['日本 €.pdf', '__ _.pdf', '%E6%97%A5%E6%9C%AC%20%E2%82%AC.pdf'],
    // A control character: refused the same way.
    ['a\u0001b.pdf', 'a_b.pdf', 'a%01b.pdf'],
    // DEL, which sits inside ASCII and is still not a character a header may hold.
    ['a\u007fb.pdf', 'a_b.pdf', 'a%7Fb.pdf'],
    // A Latin-1 letter, which Node accepts: sent as one byte before a stream and as two before
    // a string body, so `fetch` read `café` on a download and `cafÃ©` on an export.
    ['café.pdf', 'caf_.pdf', 'caf%C3%A9.pdf'],
    // A quote would end the quoted string early, and the old rule deleted it and the line
    // breaks, so the name the reader saved was not the one the respondent gave.
    ['a"b\r\n.pdf', 'a_b__.pdf', 'a%22b%0D%0A.pdf'],
    // A backslash is an escape inside a quoted string: `a\b.pdf` reads as `ab.pdf` to a parser
    // that follows the grammar, and as `a\b.pdf` to one that does not.
    ['a\\b.pdf', 'a_b.pdf', 'a%5Cb.pdf'],
    // RFC 6266 D: some readers decode a percent sign and two hex digits in the plain parameter.
    ['100%41.pdf', '100_41.pdf', '100%2541.pdf'],
    // A lone surrogate, which a JSON body can carry: `encodeURIComponent` throws on one.
    ['\ud800.pdf', '_.pdf', '%EF%BF%BD.pdf'],
    // One character beyond the BMP is one placeholder, not two for its surrogate pair.
    ['😀.pdf', '_.pdf', '%F0%9F%98%80.pdf'],
    // `encodeURIComponent` leaves `'`, `(`, `)` and `*` alone, and a `'` in an extended value
    // ends its charset or its language.
    ["日's (1)*.pdf", "_'s (1)*.pdf", '%E6%97%A5%27s%20%281%29%2A.pdf'],
  ])('%j keeps its name in the extended parameter and a readable one beside it', (name, fallback, encoded) => {
    const header = attachment(name)

    expect(header).toBe(`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`)
    expect(readBack(header).name).toBe(wellFormed(name))
  })
})

/**
 * Every UTF-16 code unit, surrogates included, between two letters, and a few code points beyond
 * the BMP: whatever a respondent or an author can put in a name.
 */
const EVERY_CHARACTER = [...Array.from({ length: 0x10000 }, (_, unit) => String.fromCharCode(unit)), '😀', '𝄞', '\u{10FFFF}'].map(
  (character) => `a${character}b.pdf`,
)

describe('a name, whatever character is in it', () => {
  test('is said exactly by the header it is given', () => {
    // A name the header cannot carry back is a file saved under the wrong name: the old rule
    // deleted a quote and line breaks without a word, and a placeholder alone would do the same
    // to every name in Japanese.
    const misread = EVERY_CHARACTER.filter((name) => readable(attachment(name)) !== wellFormed(name))

    expect(misread).toEqual([])
  })
})

describe('every value made in header-values.ts', () => {
  // The guard below lets a route write whatever a function here returns, so every export is
  // held to this, not only `attachment`: each takes the text it is made from.
  const makers = Object.entries(headerValues) as Array<[string, (text: string) => string]>

  test('is one Node writes, in printable ASCII, whatever it is made from', () => {
    // Node's own check, so the rule is Node's and not a copy of it. ASCII as well, because a
    // byte above 0x7F that Node accepts went out as one byte or as two, depending on the body.
    const refused: string[] = []
    for (const [maker, make] of makers) {
      for (const text of EVERY_CHARACTER) {
        const value = make(text)
        try {
          validateHeaderValue('x-checked', value)
          if (!/^[\x20-\x7e]*$/.test(value)) throw new Error('not printable ASCII')
        } catch {
          refused.push(`${maker}(${JSON.stringify(text)}) = ${JSON.stringify(value)}`)
        }
      }
    }

    expect(makers.length).toBeGreaterThan(0)
    expect(refused).toEqual([])
  })
})

/**
 * The calls through which the server writes a response header: Fastify's reply and Node's
 * response, by method name, on any receiver — `reply.header`, `reply.raw.setHeader`, a chain
 * after `reply.code(200)`. A false match fails loudly and costs a look; a missed one is the
 * defect this file exists for.
 */
const WRITERS = new Set(['header', 'headers', 'setHeader', 'appendHeader', 'writeHead', 'type', 'redirect', 'trailer', 'writeEarlyHints'])

const here = dirname(fileURLToPath(import.meta.url))

describe('every response header the server writes', () => {
  test('is a constant, or a value made in header-values.ts from what it is made of', () => {
    // A route that puts data in a header by hand — a template literal, a variable — is one name
    // away from the 500 above, and nothing but a hostile name finds it. The rule is read off
    // the compiler's types rather than the source's spelling: a value whose type is a literal
    // cannot have come from a request or the database, and a call into `header-values.ts` is
    // held to every code unit above.
    const parsed = ts.getParsedCommandLineOfConfigFile(
      join(here, '..', 'tsconfig.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
        },
      },
    )
    if (parsed === undefined) throw new Error('packages/server/tsconfig.json could not be read')
    const sources = parsed.fileNames.filter((file) => !file.endsWith('.test.ts'))
    const program = ts.createProgram(sources, { ...parsed.options, noEmit: true })
    const checker = program.getTypeChecker()
    const maker = join(here, 'header-values.ts')

    const constant = (type: ts.Type): boolean => type.isLiteral() || (type.isUnion() && type.types.every((member) => member.isLiteral()))
    const made = (node: ts.Expression): boolean => {
      if (!ts.isCallExpression(node)) return false
      let symbol = checker.getSymbolAtLocation(node.expression)
      if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      return symbol?.declarations?.some((declaration) => declaration.getSourceFile().fileName === maker) ?? false
    }
    const safe = (node: ts.Expression): boolean => {
      if (made(node) || constant(checker.getTypeAtLocation(node))) return true
      if (!ts.isObjectLiteralExpression(node)) return false
      // `reply.headers({ ... })` and `writeHead(status, { ... })`: each member, name and value.
      return node.properties.every((member) => ts.isPropertyAssignment(member) && !ts.isComputedPropertyName(member.name) && safe(member.initializer))
    }

    const seen = new Set<string>()
    const unsafe: string[] = []
    for (const source of program.getSourceFiles()) {
      if (!sources.includes(source.fileName)) continue
      const file = relative(here, source.fileName)
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name
          if (WRITERS.has(method.text)) {
            seen.add(file)
            for (const argument of node.arguments) {
              if (safe(argument)) continue
              const line = source.getLineAndCharacterOfPosition(method.getStart(source)).line + 1
              unsafe.push(`${file}:${String(line)} ${method.text}(… ${argument.getText(source)} …)`)
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }

    // A guard on the guard: a scan that stopped seeing the calls would pass with nothing to say.
    // These three write headers today, two of them from data.
    expect([...seen].sort()).toEqual(expect.arrayContaining(['app.ts', 'routes/files.ts', 'routes/submissions.ts']))
    expect(unsafe).toEqual([])
  })
})
