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
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pack, publishable, run } from './pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The React a consumer has. CI runs this once for the lowest React the renderers'
 * peer range admits and once for the newest (0134); a run on one machine takes the
 * newest, which is what an `npm install` today resolves.
 */
const REACT = process.env.FORMANCY_REACT ?? '^19.3.0'

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

const work = mkdtempSync(join(tmpdir(), 'formancy-install-'))
let failed = false

try {
  const packages = publishable()
  if (packages.length < 10) {
    throw new Error(`only found ${packages.length} publishable packages; the walk is wrong`)
  }

  const tarballs = pack(packages, work)
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
          react: REACT,
          'react-dom': REACT,
        },
        devDependencies: {
          // What any React consumer installs. Leaving these out made the first
          // run fail on `@types/react`, which is a finding about the fixture.
          '@types/react': REACT,
          '@types/react-dom': REACT,
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
        /*
         * The two consumer files by name, and not `*.ts`.
         *
         * `vite.config.ts` imports Vite, whose own declarations are
         * Node-flavoured — so with `skipLibCheck` off and a glob, tsc
         * type-checks Vite's internals and fails on `Cannot find name 'Buffer'`
         * in a project with no `@types/node`. Adding those types would make it
         * pass and make the program less like a browser consumer's.
         *
         * The consumer's build config is not what is on trial here. Vite still
         * reads it; tsc has no reason to.
         *
         * Found in CI after passing locally, which is the shape of trap
         * `CLAUDE.md` warns about — a glob resolves to different files depending
         * on what npm happened to install. Named by file, there is nothing left
         * to differ.
         */
        include: ['consume.ts', 'bundled.tsx', 'render.tsx'],
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

  console.log('rendering a form with the React it installed…')
  run('npx', ['tsx', 'render.tsx'], project)

  console.log('and bundling it…')
  run('npx', ['vite', 'build', '--logLevel', 'error'], project)

  console.log('\ninstall test passed: the packed tarballs work in a project that is not this one, with React ' + REACT)
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
