#!/usr/bin/env node
/**
 * Install the packed packages into a project that knows nothing about this
 * repository, and build it.
 *
 * **Why no other gate can see this.** `pnpm build`, `typecheck`, `test:coverage`
 * and `check:pkg` all run inside the workspace, against the tree they were built
 * from. A workspace sibling resolves a package through a symlink to its source
 * directory, so an `exports` map that is wrong for a real consumer can be right
 * for every test in the repository — which is exactly what happened:
 * `@formancy/builder-angular` had no `exports` at all and was unimportable from
 * anywhere, while ninety-five tests and `publint` said nothing, because the tests
 * import by relative path and `publint` reads the manifest ng-packagr generates
 * (0096).
 *
 * `attw` answers part of this statically. What it cannot do is resolve a real
 * `node_modules`, run the code, or hand the result to a bundler — and "doesn't
 * work in my app" is the top complaint for multi-framework libraries.
 *
 * **What this proves, and only this.** The tarballs `pnpm pack` produces install
 * into a plain npm project; every entry point resolves, including the separate
 * ones; the types resolve under `bundler` resolution with `skipLibCheck` off; the
 * code runs under Node; and an ordinary Vite build compiles a page that imports
 * them, stylesheet included.
 *
 * It does **not** talk to npm, so it says nothing about the registry copy: a
 * release that packed differently from `pnpm pack` would still slip through.
 * That is a much smaller gap than the one it closes, and it is in the debt table
 * rather than implied.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

/**
 * Packages a consumer imports, and why the others are not here.
 *
 * The two Angular packages are out, and not because they are suspect: consuming
 * one needs the Angular build toolchain — ng-packagr emits partial Ivy, which a
 * consumer's bundler has to run the linker over — so a project importing them is
 * an Angular project rather than a few lines of TypeScript. `apps/playground` is
 * that project, and it builds both from the workspace on every CI run.
 *
 * `@formancy/server` and `@formancy/mcp` are out for the reason the consumer
 * guard gives: nothing imports a server. The `container` job proves the server
 * image starts, which is the equivalent question for an application.
 */
const NOT_IMPORTED = {
  '@formancy/angular': 'needs the Angular build toolchain to consume, not just an import',
  '@formancy/builder-angular': 'the same, and the playground builds it on every run',
  '@formancy/server': 'an application with a composition root; the container job starts it',
  '@formancy/mcp': 'an application; its tools are driven by its own suite',
}

/** Every publishable package, as a name and the directory to pack from. */
function publishable() {
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

const run = (command, args, cwd) => {
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  if (!WINDOWS) return execFileSync(command, args, options)
  const quoted = args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg))
  return execFileSync(`${command}.cmd`, quoted, { ...options, shell: true })
}

const work = mkdtempSync(join(tmpdir(), 'formancy-install-'))
let failed = false

try {
  const packages = publishable()
  if (packages.length < 10) {
    throw new Error(`only found ${packages.length} publishable packages; the walk is wrong`)
  }

  /*
   * Pack them.
   *
   * `pnpm pack` honours `publishConfig.directory`, so an ng-packagr package
   * packs its `dist` and everything else packs its root — the same tarball a
   * release would push.
   */
  const tarballs = new Map()
  for (const { name, dir } of packages) {
    const out = run('pnpm', ['pack', '--pack-destination', work], dir)
    const file = out.trim().split('\n').at(-1)
    if (file === undefined || !file.endsWith('.tgz')) {
      throw new Error(`pnpm pack said something unexpected for ${name}: ${out}`)
    }
    tarballs.set(name, file.startsWith(work) ? file : join(work, file))
  }
  console.log(`packed ${String(tarballs.size)} packages`)

  // The fixture is copied rather than generated: see the note in `consume.ts`.
  const project = join(work, 'consumer')
  mkdirSync(project, { recursive: true })
  cpSync(join(here, 'install-fixture'), project, { recursive: true })

  const imported = packages.filter(({ name }) => NOT_IMPORTED[name] === undefined)
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'formancy-install-test',
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries(imported.map(({ name }) => [name, `file:${tarballs.get(name)}`])),
          // A consumer's own peers. The renderers declare React as a peer, and
          // installing without it is a different test — one about peer warnings
          // rather than about whether these packages work.
          react: '^19.3.0',
          'react-dom': '^19.3.0',
        },
        devDependencies: {
          // What any React consumer installs. Leaving these out made the first
          // run fail on `@types/react`, which is a finding about the fixture.
          '@types/react': '^19.3.0',
          '@types/react-dom': '^19.3.0',
          // The TypeScript the workspace pins. A consumer on a different major
          // is its own question, and Angular fixes this one for everybody.
          typescript: '~6.0.3',
          tsx: '^4.20.3',
          vite: '^8.3.0',
          '@vitejs/plugin-react': '^6.1.1',
        },
      },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    join(project, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          lib: ['ES2023', 'DOM'],
          jsx: 'react-jsx',
          noEmit: true,
          // OFF, deliberately. Skipping library checks is what lets a broken
          // declaration file reach a consumer unnoticed, and the published
          // `.d.mts` files are precisely what is on trial here.
          skipLibCheck: false,
          // What a Vite consumer has, and why a side-effect CSS import
          // type-checks at all.
          types: ['vite/client'],
        },
        include: ['*.ts', '*.tsx'],
      },
      null,
      2,
    )}\n`,
  )

  console.log('installing the tarballs into a plain npm project…')
  // npm rather than pnpm, deliberately: pnpm in a directory under a workspace
  // can still find the workspace, and resolving through it is the thing this
  // test exists to avoid.
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], project)

  console.log('type-checking the consumer against the installed types…')
  run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], project)

  console.log('running it under Node…')
  run('npx', ['tsx', 'consume.ts'], project)

  console.log('and bundling it…')
  run('npx', ['vite', 'build', '--logLevel', 'error'], project)

  console.log('\ninstall test passed: the packed tarballs work in a project that is not this one')
} catch (error) {
  failed = true
  console.error('\ninstall test FAILED')
  console.error(error.message)
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`
  if (detail.trim() !== '') console.error(detail.slice(0, 6000))
} finally {
  rmSync(work, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
