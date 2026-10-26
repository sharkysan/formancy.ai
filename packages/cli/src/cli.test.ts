import { describe, expect, test } from 'vitest'
import { answersTypeScript } from '@formancy/spec'
import type { FormSchema } from '@formancy/spec'
import { run } from './cli.js'
import type { CliIo } from './cli.js'

const form: FormSchema = {
  specVersion: '4',
  id: 'contact-us',
  title: 'Contact us',
  model: { fields: [{ key: 'name', type: 'text', label: 'Your name' }] },
}

/** The command against files held in memory, with what it printed. */
function harness(files: Record<string, string>) {
  const written: Record<string, string> = {}
  let out = ''
  let err = ''
  const io: CliIo = {
    readFile: async (path) => {
      if (!(path in files)) throw new Error('ENOENT: no such file')
      return files[path]!
    },
    writeFile: async (path, text) => {
      written[path] = text
    },
    out: (text) => {
      out += text
    },
    err: (text) => {
      err += text
    },
  }
  return { io, written, output: () => ({ out, err }) }
}

describe('formancy types', () => {
  // The command is the function and a file read: a build script calling the function and
  // somebody running the command must get the same type, byte for byte.
  test('prints exactly what answersTypeScript prints', async () => {
    const { io, output } = harness({ 'form.json': JSON.stringify(form) })
    expect(await run(['types', 'form.json'], io)).toBe(0)
    expect(output()).toEqual({ out: answersTypeScript(form), err: '' })
  })

  test('writes it to a file when asked, and names the type when asked', async () => {
    const { io, written, output } = harness({ 'form.json': JSON.stringify(form) })
    expect(await run(['types', 'form.json', '--out', 'answers.ts', '--name', 'Contact'], io)).toBe(0)
    expect(written['answers.ts']).toBe(answersTypeScript(form, { name: 'Contact' }))
    expect(output().out).toBe('')
  })

  // A type printed from a document the engine refuses to load describes submissions nobody
  // can make. The author is told what is wrong with the document instead, in its words.
  test('refuses a document that is not a valid form, saying why', async () => {
    const broken = { ...form, model: { fields: [{ key: 'name', type: 'colour' }] } }
    const { io, output } = harness({ 'form.json': JSON.stringify(broken) })
    expect(await run(['types', 'form.json'], io)).toBe(1)
    expect(output().out).toBe('')
    expect(output().err).toMatch(/form\.json is not a form this version of formancy reads:\n {2}\/model\/fields\/0/)
  })

  test('says so when the file is missing or is not JSON', async () => {
    const missing = harness({})
    expect(await run(['types', 'nope.json'], missing.io)).toBe(1)
    expect(missing.output().err).toMatch(/cannot read nope\.json/)

    const garbled = harness({ 'form.json': '{ "id": ' })
    expect(await run(['types', 'form.json'], garbled.io)).toBe(1)
    expect(garbled.output().err).toMatch(/form\.json is not JSON/)
  })

  // A misuse exits 2, not 1, so a script can tell "you called it wrong" from "the form is wrong".
  test.each([
    [[], /Usage: formancy types/],
    [['typo'], /"typo" is not a command/],
    [['types'], /which form\?/],
    [['types', 'a.json', 'b.json'], /one form at a time/],
    [['types', 'a.json', '--name'], /--name needs a value/],
    [['types', 'a.json', '--colour', 'red'], /--colour is not an option/],
  ])('%o is a misuse', async (args, message) => {
    const { io, output } = harness({ 'a.json': JSON.stringify(form) })
    expect(await run(args, io)).toBe(2)
    expect(output().out + output().err).toMatch(message)
  })

  test('a type name that is not an identifier is a misuse', async () => {
    const { io, output } = harness({ 'form.json': JSON.stringify(form) })
    expect(await run(['types', 'form.json', '--name', 'not a name'], io)).toBe(2)
    expect(output().err).toMatch(/not a TypeScript identifier/)
  })

  test('--help prints the usage and succeeds', async () => {
    const { io, output } = harness({})
    expect(await run(['--help'], io)).toBe(0)
    expect(output().out).toMatch(/^Usage: formancy types/)
  })
})
