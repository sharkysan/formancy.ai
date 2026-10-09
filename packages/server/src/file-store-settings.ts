import type { S3FileStoreConfig } from './s3-file-store.js'

/**
 * Which store the environment names for uploaded bytes: none, a directory, or an
 * S3-compatible object store.
 *
 * A function of the environment rather than lines in `main.ts`, because it is a
 * decision with rules and `main.ts` is a composition root that no test imports.
 * The rules are where a deployment goes wrong — two stores named at once, an
 * endpoint without its credentials — and a rule nothing runs is a claim nobody
 * checked. Constructing the store stays in `main.ts`; this only says which.
 */
export type FileStoreSettings =
  | { readonly kind: 'none' }
  | { readonly kind: 'local'; readonly directory: string }
  | { readonly kind: 's3'; readonly config: S3FileStoreConfig }

type Environment = Readonly<Record<string, string | undefined>>

/**
 * Absent — or empty, see `setting` — means this deployment accepts no files,
 * and that is a supported state rather than a misconfiguration: a form with a
 * file field still renders and still submits, and the field says plainly that
 * there is nowhere to put one. Turning uploads on is naming a directory, which
 * in a container is naming a volume — and a volume is the one thing a
 * self-hoster has to think about, so it is not defaulted here.
 *
 * Throws on a configuration that names two stores, or an object store without
 * everything it needs, so the server refuses to start rather than serving one.
 */
export function fileStoreSettings(env: Environment): FileStoreSettings {
  const directory = setting(env, 'FORMANCY_FILES_DIR')
  const endpoint = setting(env, 'FORMANCY_S3_ENDPOINT')

  if (directory !== undefined && endpoint !== undefined) {
    // Two stores means half the files are in one and half in the other, and
    // nothing records which -- so a later reader gets "no such file" for bytes
    // that exist in the store it did not ask. Refusing at startup is the only
    // point at which this is cheap to fix.
    throw new Error(
      'Set FORMANCY_FILES_DIR or FORMANCY_S3_ENDPOINT, not both: two stores means ' +
        'files land in one and are looked for in the other.',
    )
  }

  if (endpoint !== undefined) {
    // Every field is required once the endpoint is set, and none is defaulted. A
    // bucket name guessed wrong is a deployment that accepts uploads into
    // nothing; credentials guessed wrong are a deployment where every file reads
    // as missing. Both fail here instead.
    const required = (name: string): string => {
      const value = env[name]
      if (value === undefined || value === '') {
        throw new Error(`${name} is required when FORMANCY_S3_ENDPOINT is set.`)
      }
      return value
    }

    return {
      kind: 's3',
      config: {
        endpoint,
        bucket: required('FORMANCY_S3_BUCKET'),
        // Part of the credential scope, so a wrong region is a signature the
        // store computes differently and rejects. Garage answers to any name and
        // real S3 does not, which is why there is no default.
        region: required('FORMANCY_S3_REGION'),
        accessKeyId: required('FORMANCY_S3_ACCESS_KEY_ID'),
        secretAccessKey: required('FORMANCY_S3_SECRET_ACCESS_KEY'),
      },
    }
  }

  return directory === undefined ? { kind: 'none' } : { kind: 'local', directory }
}

/**
 * A setting, with the empty string read as unset.
 *
 * Because compose cannot remove a variable, only blank it. Both compose files
 * point FORMANCY_FILES_DIR at their volume, and `.env` switching to the object
 * store does so by setting it to `""` — which, read as a directory, is two
 * stores and a server that refuses to start. Read as a path it is no better:
 * `createLocalFileStore('')` resolves to the working directory, which switches
 * uploads on in a directory nobody chose — in the published image, `/app`,
 * which its user cannot write.
 */
function setting(env: Environment, name: string): string | undefined {
  const value = env[name]
  return value === '' ? undefined : value
}
