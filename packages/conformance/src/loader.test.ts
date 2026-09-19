import { describe, expect, test } from 'vitest'
import type { FixtureSource } from './loader.js'
import { loadFixtures } from './loader.js'

function caseFile(name: string): string {
  return JSON.stringify({
    name,
    schema: {
      specVersion: '0',
      id: 'contact',
      title: 'Contact us',
      model: { fields: [{ key: 'email', type: 'text', label: 'Email' }] },
    },
    steps: [{ set: { email: 'ada@example.com' } }],
  })
}

/** An in-memory directory. The loader is given its reader rather than importing
 *  node:fs, which is the whole point of the abstraction. */
function sourceOf(files: Record<string, string>): FixtureSource {
  return {
    list: () => Object.keys(files),
    read: (file) => files[file] ?? '',
  }
}

describe('loadFixtures', () => {
  test('parses every JSON file in the directory, in file name order', async () => {
    const fixtures = await loadFixtures(
      sourceOf({ 'b-second.json': caseFile('second'), 'a-first.json': caseFile('first') }),
    )

    expect(fixtures.map((fixture) => fixture.name)).toEqual(['first', 'second'])
  })

  test('ignores anything that is not a .json file', async () => {
    const fixtures = await loadFixtures(
      sourceOf({ 'README.md': 'not a fixture', 'a.json': caseFile('only one') }),
    )

    expect(fixtures).toHaveLength(1)
  })

  test('names the file when the JSON does not parse', async () => {
    const source = sourceOf({ 'broken.json': '{ "name": ' })

    await expect(loadFixtures(source)).rejects.toThrow(/broken\.json/)
  })

  test('names the file when the fixture is malformed', async () => {
    const source = sourceOf({ 'empty-steps.json': JSON.stringify({ name: 'x', steps: [] }) })

    await expect(loadFixtures(source)).rejects.toThrow(/empty-steps\.json/)
  })

  test('refuses two files that declare the same fixture name, since the name is the test id', async () => {
    const source = sourceOf({ 'a.json': caseFile('same'), 'b.json': caseFile('same') })

    await expect(loadFixtures(source)).rejects.toThrow(/same/)
  })

  test('awaits an asynchronous source, so node:fs promises drop straight in', async () => {
    const files = { 'a.json': caseFile('from a promise') }
    const fixtures = await loadFixtures({
      list: async () => Object.keys(files),
      read: async (file) => files[file as keyof typeof files],
    })

    expect(fixtures[0]?.name).toBe('from a promise')
  })
})
