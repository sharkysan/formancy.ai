import { randomBytes } from 'node:crypto'
import { GenericContainer, Wait } from 'testcontainers'
import type { StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createS3FileStore } from './s3-file-store.js'
import type { FileStore } from './file-store.js'

/**
 * The S3 store against Garage, which is the implementation the design calls for.
 *
 * **This is the oracle for the signature.** `sigv4.ts` is sixty lines of our own
 * against a frozen specification, and the unit tests around it can only show it
 * is self-consistent -- they would pass just as happily on a canonical request
 * that every real S3 refuses. Garage is somebody else's implementation of the
 * verifying half: a signature that is wrong in any of the six steps is a 403 here
 * and nothing gets stored.
 *
 * The same reasoning as the Postgres integration tests, which exist because
 * versioning defects only appear against real SQL semantics
 * ([0033](../../../docs/decisions/0033-one-suite-n-drivers.md) is the general
 * form). A mocked S3 would agree with whatever we wrote.
 *
 * **Garage rather than MinIO.** MinIO Community Edition lost console features in
 * 2025, entered maintenance, and the repository was archived in 2026, so the
 * design picked Garage and this tests what will be in the compose file. Nothing
 * here is Garage-specific beyond the bootstrap: the store speaks path-style S3
 * with SigV4, which real S3, R2 and Backblaze also speak.
 *
 * Garage does not come up usable. A fresh node has no layout, and without a
 * layout it accepts no data; then a key and a bucket have to be created and the
 * key allowed on the bucket. That is four `garage` commands after the container
 * starts, and they are here rather than in a fixture image so that the version
 * under test is the version named in one place.
 */
const IMAGE = 'dxflrs/garage:v1.0.1'

/**
 * Garage needs a config file before it will start. Single node, no replication,
 * both secrets fixed because this container lives for one test run.
 */
const CONFIG = `
metadata_dir = "/tmp/meta"
data_dir = "/tmp/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${'0'.repeat(64)}"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage"
`

let container: StartedTestContainer
let store: FileStore

beforeAll(async () => {
  container = await new GenericContainer(IMAGE)
    .withCopyContentToContainer([{ content: CONFIG, target: '/etc/garage.toml' }])
    .withExposedPorts(3900)
    // A log line, not a port check. Testcontainers' port strategy also probes
    // the port from *inside* the container, and this image has no tooling for
    // that -- so it waited the full two minutes and failed on a Garage that was
    // up and listening the whole time. The line below is the one Garage prints
    // when the S3 listener is actually accepting, which is the thing worth
    // waiting for anyway. A layout still has to be assigned after it.
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .withStartupTimeout(120_000)
    .start()

  const run = async (...command: string[]): Promise<string> => {
    const result = await container.exec(['/garage', ...command])
    if (result.exitCode !== 0) {
      throw new Error(`garage ${command.join(' ')} failed (${String(result.exitCode)}): ${result.output}`)
    }
    return result.output
  }

  // A node with no layout stores nothing, and says so with an unhelpful error at
  // PUT time rather than at startup.
  const status = await run('status')
  const nodeId = /^([0-9a-f]{16,})/m.exec(status.replace(/\u001b\[[0-9;]*m/g, ''))?.[1]
  if (nodeId === undefined) throw new Error(`Could not find the node id in: ${status}`)

  await run('layout', 'assign', '-z', 'dc1', '-c', '1G', nodeId)
  await run('layout', 'apply', '--version', '1')
  await run('bucket', 'create', 'formancy')

  // Positional, not `--name`: v1.0.1 rejects the flag. Checked against
  // `garage key create --help` in the image rather than guessed twice.
  const created = await run('key', 'create', 'test')
  const plain = created.replace(/\u001b\[[0-9;]*m/g, '')
  const accessKeyId = /Key ID:\s*(\S+)/.exec(plain)?.[1]
  const secretAccessKey = /Secret key:\s*(\S+)/.exec(plain)?.[1]
  if (accessKeyId === undefined || secretAccessKey === undefined) {
    throw new Error(`Could not read the created key from: ${plain}`)
  }

  await run('bucket', 'allow', '--read', '--write', 'formancy', '--key', 'test')

  store = createS3FileStore({
    endpoint: `http://${container.getHost()}:${String(container.getMappedPort(3900))}`,
    bucket: 'formancy',
    // Must match `s3_region` in the config: the region is part of the credential
    // scope, so a mismatch is a signature Garage computes differently.
    region: 'garage',
    accessKeyId,
    secretAccessKey,
  })
}, 180_000)

afterAll(async () => {
  await container?.stop()
})

describe('the S3 file store against Garage', () => {
  test('stores bytes and reads back exactly what was stored', async () => {
    // The signature is proved by this passing at all: Garage verifies it before
    // it stores anything, so a wrong canonical request is a 403 here.
    const bytes = randomBytes(4096)
    await store.put('forms/round-trip/file-1', bytes)

    const stream = await store.open('forms/round-trip/file-1')
    expect(stream).toBeDefined()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk as Buffer))
    // Compared as bytes, not as a string: a transcoding bug survives a string
    // comparison of anything that happens to be valid UTF-8.
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true)
  })

  test('reports the stored size', async () => {
    await store.put('sized', Buffer.alloc(1234, 7))
    await expect(store.sizeOf('sized')).resolves.toBe(1234)
  })

  test('answers undefined for an object that was never stored', async () => {
    // Against a real implementation, because this is where the 404-versus-403
    // question is actually decided. An earlier version of the store read 403 as
    // absence, which would make wrong credentials look like an empty store.
    await expect(store.open('never-written')).resolves.toBeUndefined()
    await expect(store.sizeOf('never-written')).resolves.toBeUndefined()
  })

  test('removes bytes, and removing them again is still success', async () => {
    await store.put('temporary', Buffer.from('go away'))
    await store.remove('temporary')
    await expect(store.sizeOf('temporary')).resolves.toBeUndefined()
    // The collector has to be safe to re-run.
    await expect(store.remove('temporary')).resolves.toBeUndefined()
  })

  test('keeps a key with a space and a key with slashes distinct and intact', async () => {
    // The encoding rule, verified by the only thing that can settle it. A key
    // encoded as `+` or with its slashes escaped names a different object, and
    // the symptom is a file that uploads successfully and cannot be found.
    await store.put('forms/a b/c d.txt', Buffer.from('spaced'))
    await store.put('forms/a+b/c+d.txt', Buffer.from('plussed'))

    const read = async (key: string): Promise<string> => {
      const stream = await store.open(key)
      const chunks: Buffer[] = []
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk as Buffer))
      return Buffer.concat(chunks).toString('utf8')
    }
    expect(await read('forms/a b/c d.txt')).toBe('spaced')
    expect(await read('forms/a+b/c+d.txt')).toBe('plussed')
  })

  test('rejects a signature made with the wrong secret', async () => {
    // The guard on the oracle. Every case above passes because Garage accepted
    // the signature -- which is only evidence if Garage would have refused a
    // wrong one. Without this, a Garage configured to ignore signatures would
    // make the whole file vacuous.
    const wrong = createS3FileStore({
      endpoint: `http://${container.getHost()}:${String(container.getMappedPort(3900))}`,
      bucket: 'formancy',
      region: 'garage',
      accessKeyId: 'GK0000000000000000000000',
      secretAccessKey: 'not-the-secret',
    })
    await expect(wrong.put('nope', Buffer.from('x'))).rejects.toThrow(/40[13]/)
  })
})
