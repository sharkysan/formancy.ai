import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createLocalFileStore, sha256 } from './file-store.js'

/**
 * Bytes on a disk, and the one thing that can go badly wrong with them.
 *
 * Keys are minted by the server from a form id and a file id, so today none of
 * them can contain a traversal. The guard exists anyway, and is tested anyway,
 * because a path check that only runs when the input is untrusted is a path
 * check that stops running the day somebody adds a caller.
 */
let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'formancy-files-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('storing and reading back', () => {
  test('a file round-trips', async () => {
    const store = createLocalFileStore(root)

    await store.put('form1/file1', Buffer.from('hello'))
    const stream = await store.open('form1/file1')

    expect(stream).toBeDefined()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(chunk as Buffer)
    expect(Buffer.concat(chunks).toString()).toBe('hello')
  })

  test('nested keys create their directories', async () => {
    const store = createLocalFileStore(root)

    await store.put('a/b/c/file', Buffer.from('x'))

    expect((await readFile(join(root, 'a', 'b', 'c', 'file'))).toString()).toBe('x')
  })

  test('reading something that is not there is undefined, not a throw', async () => {
    expect(await createLocalFileStore(root).open('form1/ghost')).toBeUndefined()
  })

  test('the size is the size', async () => {
    const store = createLocalFileStore(root)

    await store.put('form1/file1', Buffer.alloc(4096))

    expect(await store.sizeOf('form1/file1')).toBe(4096)
    expect(await store.sizeOf('form1/ghost')).toBeUndefined()
  })
})

describe('removing', () => {
  test('deletes the bytes', async () => {
    const store = createLocalFileStore(root)
    await store.put('form1/file1', Buffer.from('x'))

    await store.remove('form1/file1')

    expect(await store.open('form1/file1')).toBeUndefined()
  })

  test('removing something twice is not an error', async () => {
    const store = createLocalFileStore(root)

    // A collector that crashed between deleting the bytes and deleting the row
    // will try again. Failing the second time would stop it forever.
    await store.remove('form1/ghost')
    await expect(store.remove('form1/ghost')).resolves.toBeUndefined()
  })
})

describe('keys that try to leave', () => {
  test.each([
    '../escaped',
    'form1/../../escaped',
    './../../escaped',
    '..\\escaped',
  ])('refuses %s', async (key) => {
    const store = createLocalFileStore(root)

    await expect(store.put(key, Buffer.from('x'))).rejects.toThrow(/outside the store/)
  })

  test('refuses reading outside as well as writing', async () => {
    const store = createLocalFileStore(root)

    await expect(store.open('../../etc/passwd')).rejects.toThrow(/outside the store/)
    await expect(store.remove('../../etc/passwd')).rejects.toThrow(/outside the store/)
  })

  test('a sibling directory with the same prefix is outside', async () => {
    // `startsWith(root)` alone matches `/tmp/formancy-evil` against
    // `/tmp/formancy`, which is why the separator is part of the test.
    const store = createLocalFileStore(join(root, 'store'))
    await writeFile(join(root, 'store-evil'), 'x').catch(() => undefined)

    await expect(store.open('../store-evil')).rejects.toThrow(/outside the store/)
  })
})

describe('sha256', () => {
  test('is the checksum of the bytes', () => {
    // Pinned against a known value rather than against another call to the
    // same function, which would agree with itself however wrong it was.
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
