import { describe, expect, test } from 'vitest'
import { fileStoreSettings } from './file-store-settings.js'

/**
 * Which store the environment names, and which configurations are refused.
 *
 * The server reads these at startup and nowhere else, so a wrong answer here is
 * either a server that refuses to start or one that keeps bytes somewhere nobody
 * will look for them.
 */
const s3 = {
  FORMANCY_S3_ENDPOINT: 'http://garage:3900',
  FORMANCY_S3_BUCKET: 'formancy',
  FORMANCY_S3_REGION: 'garage',
  FORMANCY_S3_ACCESS_KEY_ID: 'GKexample',
  FORMANCY_S3_SECRET_ACCESS_KEY: 'example-secret',
} as const

describe('which store the environment names', () => {
  test('none when nothing is set', () => {
    // A default directory would be uploads switched on in a place nobody chose —
    // in a container, its own filesystem, deleted on the next deploy.
    expect(fileStoreSettings({})).toEqual({ kind: 'none' })
  })

  test('a directory when only the directory is set', () => {
    // The single-container deployment compose sets up; losing it is uploads off
    // for everybody who never asked for an object store.
    expect(fileStoreSettings({ FORMANCY_FILES_DIR: '/var/lib/formancy/files' })).toEqual({
      kind: 'local',
      directory: '/var/lib/formancy/files',
    })
  })

  test('the object store, with all four of its settings, when the endpoint is set', () => {
    // A setting read under the wrong name is a store that signs with an empty
    // credential, which looks exactly like a store where every file is missing.
    expect(fileStoreSettings(s3)).toEqual({
      kind: 's3',
      config: {
        endpoint: 'http://garage:3900',
        bucket: 'formancy',
        region: 'garage',
        accessKeyId: 'GKexample',
        secretAccessKey: 'example-secret',
      },
    })
  })
})

describe('what is refused', () => {
  test('a directory and an endpoint together', () => {
    // Two stores means files land in one and are looked for in the other, and
    // nothing records which.
    expect(() =>
      fileStoreSettings({ ...s3, FORMANCY_FILES_DIR: '/var/lib/formancy/files' }),
    ).toThrow(/not both/)
  })

  test.each([
    'FORMANCY_S3_BUCKET',
    'FORMANCY_S3_REGION',
    'FORMANCY_S3_ACCESS_KEY_ID',
    'FORMANCY_S3_SECRET_ACCESS_KEY',
  ])('an endpoint without %s, missing or empty', (name) => {
    // None is defaulted: a guessed bucket uploads into nothing and a guessed
    // credential reads every file as missing. The message names the setting, so
    // the refusal says what to fix.
    expect(() => fileStoreSettings({ ...s3, [name]: undefined })).toThrow(name)
    expect(() => fileStoreSettings({ ...s3, [name]: '' })).toThrow(name)
  })
})

describe('an empty setting is an unset one', () => {
  test('an empty directory is no store, not the working directory', () => {
    // `createLocalFileStore('')` resolves to the process's working directory, so
    // a blanked FORMANCY_FILES_DIR would switch uploads ON, in a directory nobody
    // chose. In the published image that is `/app`, which its user cannot write,
    // so every file would be offered a place and then refused one.
    expect(fileStoreSettings({ FORMANCY_FILES_DIR: '' })).toEqual({ kind: 'none' })
  })

  test('an empty directory beside an endpoint leaves the object store', () => {
    // How compose switches stores: both files pass FORMANCY_FILES_DIR to the
    // container, and `.env` can only blank it, not remove it. Refusing this as two
    // stores is a server that restart-loops for everybody following the S3 block
    // of .env.example.
    expect(fileStoreSettings({ ...s3, FORMANCY_FILES_DIR: '' })).toMatchObject({ kind: 's3' })
  })

  test('an empty endpoint beside a directory leaves the directory', () => {
    // An `.env` with `FORMANCY_S3_ENDPOINT=` left in it would otherwise refuse the
    // volume compose sets up as a second store.
    expect(
      fileStoreSettings({ FORMANCY_S3_ENDPOINT: '', FORMANCY_FILES_DIR: '/var/lib/formancy/files' }),
    ).toEqual({ kind: 'local', directory: '/var/lib/formancy/files' })
  })

  test('an empty endpoint alone is no store, not a demand for four more settings', () => {
    // Treated as set, it would refuse to start until a bucket and credentials
    // were supplied for an object store nobody asked for.
    expect(fileStoreSettings({ FORMANCY_S3_ENDPOINT: '' })).toEqual({ kind: 'none' })
  })
})
