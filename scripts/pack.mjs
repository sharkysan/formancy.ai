/**
 * Packing the publishable packages, for the tests that install them somewhere else.
 *
 * Shared by `install-test.mjs` (the React and isomorphic packages) and
 * `angular-install-test.mjs` (the Angular ones), which used to be one script: the
 * second needs the same tarballs and a different project, and two copies of how a
 * package is packed would be two answers to what a release pushes.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Every publishable package, as a name and the directory to pack from. */
export function publishable() {
  const root = join(repo, 'packages')
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const file = join(root, entry.name, 'package.json')
      let manifest
      try {
        manifest = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        return []
      }
      if (manifest.private === true || manifest.name === undefined) return []
      return [{ name: manifest.name, dir: join(root, entry.name) }]
    })
}

/**
 * Run a Node tool, on either platform.
 *
 * `pnpm`, `npm` and `npx` are `.cmd` shims on Windows, so the bare name is
 * `spawnSync ENOENT` there — and Node 20 and later refuse to spawn a `.cmd` at
 * all without a shell, which is `EINVAL`. Both were met, in that order. So
 * Windows gets a shell with every argument quoted, and everywhere else gets the
 * executable directly, which is the safer of the two and is what CI runs.
 */
const WINDOWS = process.platform === 'win32'

export const run = (command, args, cwd) => {
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  if (!WINDOWS) return execFileSync(command, args, options)
  const quoted = args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg))
  return execFileSync(`${command}.cmd`, quoted, { ...options, shell: true })
}

/**
 * Pack the named packages into `work`, returning each one's tarball.
 *
 * `pnpm pack` honours `publishConfig.directory`, so an ng-packagr package packs its
 * `dist` and everything else packs its root — the same tarball a release would push.
 */
export function pack(packages, work) {
  const tarballs = new Map()
  for (const { name, dir } of packages) {
    const out = run('pnpm', ['pack', '--pack-destination', work], dir)
    const file = out.trim().split('\n').at(-1)
    if (file === undefined || !file.endsWith('.tgz')) {
      throw new Error(`pnpm pack said something unexpected for ${name}: ${out}`)
    }
    tarballs.set(name, file.startsWith(work) ? file : join(work, file))
  }
  return tarballs
}
