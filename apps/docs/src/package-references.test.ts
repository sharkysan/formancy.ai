import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * Every package and command the documentation names is one the workspace has.
 *
 * **The defect this exists for.** The roadmap told somebody weighing formancy against
 * form.io that `npx @formancy/cli types` emits a real type per form, and the migration guide
 * and the versioning page both said `@formancy/cli migrate` rewrites documents forward. There
 * was no `packages/cli`, no workspace package by that name, and the only command any manifest
 * declared was the MCP server's — so the one line on the roadmap a reader could copy and run
 * was a 404 from npm. Each was a plan written in the present tense, and nothing compared it
 * with the manifests.
 *
 * So the facts come from the manifests and never from the prose: every package under
 * `packages/` and `apps/`, whether it is published, and the commands its `bin` declares.
 * Against those, four things a page can say:
 *
 * - **a package name** — `@formancy/<name>` in prose, in backticks, in a code block, in a link,
 *   in a shields.io badge's percent-encoded URL, or with a path after it as in
 *   `@formancy/themes/blueprint.css`. It must be in the workspace.
 * - **a package to fetch and run** — `npx`, `pnpx`, `bunx`, `npm exec`, `npm x`, `pnpm dlx`
 *   and `yarn dlx`, on a shell line or as an MCP client's `command` and `args`. Ours must be
 *   published and declare a command npx can find; anybody else's must be named below.
 * - **a package to install** — `npm install` and its relatives. Ours must be published.
 * - **a command run bare** — `formancy…` as the first word of a line in a shell code block,
 *   or `formancy` with arguments in a Markdown code span. It must be a command some manifest
 *   declares.
 *
 * `pnpm exec` and `yarn exec` are not on the list on purpose: they run only what a workspace
 * dependency already installed, and fetch nothing.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const SCOPE = '@formancy/'

interface WorkspacePackage {
  readonly name: string
  readonly published: boolean
  /** Command names, as npm installs them: a string `bin` is named after the package. */
  readonly bins: readonly string[]
}

/** Every package in `packages/` and `apps/`, read from its manifest. */
function workspacePackages(): Map<string, WorkspacePackage> {
  const found = new Map<string, WorkspacePackage>()
  for (const group of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      let manifest: { name?: string; private?: boolean; bin?: string | Record<string, string> }
      try {
        const file = join(repo, group, entry.name, 'package.json')
        manifest = JSON.parse(readFileSync(file, 'utf8')) as typeof manifest
      } catch {
        continue
      }
      if (manifest.name === undefined) continue
      const bins =
        manifest.bin === undefined
          ? []
          : typeof manifest.bin === 'string'
            ? [manifest.name.replace(/^@[^/]+\//, '')]
            : Object.keys(manifest.bin)
      found.set(manifest.name, { name: manifest.name, published: manifest.private !== true, bins })
    }
  }
  return found
}

/**
 * Packages a page may tell somebody to fetch that are not ours, each with the reason.
 *
 * Whether a stranger's package exists is a question for the npm registry, and a check that
 * needs the network answers differently in CI, so it is not asked. Naming each one instead
 * means a new one fails here until somebody has looked at it, and a reason is what makes
 * the list something a reviewer can disagree with.
 */
const FETCHED_FROM_ELSEWHERE: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: 'wrangler',
    why: "Cloudflare's own deploy command, in the README's paragraph on serving the composed site from Cloudflare. Deploying is whatever serves a directory, so nothing here depends on it.",
  },
]

/**
 * Where a reader is told what exists: every Markdown file, and the landing page's source.
 *
 * Two exclusions, both for the reason `claims.test.ts` gives. A changelog records what was
 * said at the time — including, now, that the CLI was named and is not built. A decision
 * record names the alternatives it rejected, and a rejected package is one that does not
 * exist by definition: `@formancy/site-shell` in 0106, `@formancy/angular-material` in 0132.
 *
 * Dot-directories are skipped but `.github`: a checkout with `.claude/worktrees` in it holds
 * whole older copies of these documents.
 */
function documents(): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = []
  const walk = (directory: string, keep: (file: string) => boolean): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'coverage', 'out-tsc'].includes(entry.name)) continue
        if (entry.name.startsWith('.') && entry.name !== '.github') continue
        if (full === join(repo, 'docs', 'decisions')) continue
        walk(full, keep)
        continue
      }
      if (entry.name === 'CHANGELOG.md' || !keep(entry.name)) continue
      out.push({ name: relative(repo, full).replaceAll('\\', '/'), text: readFileSync(full, 'utf8') })
    }
  }
  walk(repo, (file) => /\.mdx?$/.test(file))
  // The landing page is written in TSX and HTML, and it is the page an evaluator reads first.
  walk(join(repo, 'apps', 'site'), (file) => /\.(tsx?|html)$/.test(file) && !/\.test\.tsx?$/.test(file))
  return out
}

/**
 * A badge URL spells the scope `%40formancy%2Fcore`. Decoded first, so the URL a reader
 * follows is held to the same list as the name beside it.
 */
const decoded = (text: string): string => text.replace(/%40/gi, '@').replace(/%2F/gi, '/')

/** A package spec without its version or the punctuation of the sentence it ends. */
const packageOf = (spec: string): string => {
  const trimmed = spec.replace(/[.,:]+$/, '')
  const at = trimmed.indexOf('@', 1)
  return at === -1 ? trimmed : trimmed.slice(0, at)
}

/**
 * Every `@formancy/<name>`, stopping at the name: `@formancy/themes/blueprint.css` names
 * `@formancy/themes`, and `@formancy/mcp@0.4.0` names `@formancy/mcp`. Case is kept, so a
 * capital that npm would refuse is reported rather than folded away.
 */
function scopedNames(text: string): string[] {
  return [...decoded(text).matchAll(/@formancy\/[a-z0-9][a-z0-9._~-]*/gi)].map((match) =>
    match[0].replace(/\.+$/, ''),
  )
}

/** The rest of a shell command after a word: up to a quote, a pipe, a comment or the line's end. */
const REST = String.raw`([^\n\x60'"<>|;&(){}#\\]*)`

/** A runner that fetches the package it is given, then runs it. */
const RUNNER = new RegExp(
  String.raw`(?<![\w./-])(?:npx|pnpx|bunx|npm\s+(?:exec|x)|pnpm\s+dlx|yarn\s+dlx)(?![\w-])` + REST,
  'g',
)

/** The same thing configured rather than typed: an MCP client's `command` and `args`. */
const CONFIGURED =
  /\bcommand["']?\s*[:=]\s*["'](?:npx|pnpx|bunx)["'][^}]*?\bargs["']?\s*[:=]\s*\[([^\]]*)\]/g

interface Run {
  /** The packages fetched, without versions. */
  readonly packages: readonly string[]
  /** The command run from them — said only when `--package` named them. */
  readonly command?: string
}

/**
 * What a runner's arguments fetch. `-p`/`--package` name the packages and the next word is a
 * command in one of them; otherwise the first word is the package. Any other flag is taken
 * to carry no value, so one that does must be written `--flag=value` — get that wrong and
 * the value is reported as a package, which fails loudly rather than passing.
 */
function parseRun(words: readonly string[]): Run | undefined {
  const named: string[] = []
  let at = 0
  for (; at < words.length; at++) {
    const word = words[at]!
    if (word === '--') {
      at++
      break
    }
    if (!word.startsWith('-')) break
    if (word === '-p' || word === '--package') named.push(words[++at] ?? '')
    else if (word.startsWith('--package=')) named.push(word.slice('--package='.length))
  }
  const first = words[at]
  if (named.length > 0) {
    return { packages: named.map(packageOf), ...(first === undefined ? {} : { command: first }) }
  }
  return first === undefined ? undefined : { packages: [packageOf(first)] }
}

/** Every package a text has a runner fetch, typed on a shell line or configured. */
function runs(text: string): Run[] {
  const words = (rest: string): string[] => rest.split(/\s+/).filter((word) => word !== '')
  const typed = [...text.matchAll(RUNNER)].map((match) => parseRun(words(match[1]!)))
  const configured = [...text.matchAll(CONFIGURED)].map((match) =>
    parseRun([...match[1]!.matchAll(/["']([^"']*)["']/g)].map((arg) => arg[1]!)),
  )
  return [...typed, ...configured].filter((run): run is Run => run !== undefined)
}

/** Our packages an install command asks npm for. */
function installed(text: string): string[] {
  const INSTALL = new RegExp(
    String.raw`(?<![\w./-])(?:npm\s+(?:i|install|add)|pnpm\s+(?:add|i|install)|yarn\s+add|bun\s+(?:add|i|install))(?![\w-])` +
      REST,
    'g',
  )
  return [...decoded(text).matchAll(INSTALL)].flatMap((match) =>
    match[1]!
      .split(/\s+/)
      .filter((word) => word.startsWith(SCOPE))
      .map(packageOf),
  )
}

/**
 * `formancy…` run as a command: the first word of a line in a shell code block — after a
 * prompt, environment assignments, or `&&` — which is unambiguous.
 *
 * A code span is not, and is read more narrowly: only in Markdown, and only the bare word
 * `formancy` with arguments after it. Every Angular element is `formancy-…`, and the first
 * version of this read `formancy-layout { display: contents }` in 0073 as a command — a CSS
 * rule. In TypeScript a backtick opens a template literal, and some of the packages' own
 * messages begin `formancy has…` or `formancy speaks…`.
 */
function bareCommands(text: string, markdown: boolean): string[] {
  const COMMAND = /^formancy(?:-[a-z0-9-]+)?$/
  const found: string[] = []
  const fences = /```(?:bash|sh|shell|console|zsh|fish|powershell|pwsh)[^\n]*\n([\s\S]*?)```/g
  for (const fence of text.matchAll(fences)) {
    for (const line of fence[1]!.split('\n')) {
      for (const segment of line.replace(/^\s*(?:\$|>|PS>)\s+/, '').split(/&&|\|\||;|\|/)) {
        const first = segment.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '').split(/\s+/)[0]
        if (first !== undefined && COMMAND.test(first)) found.push(first)
      }
    }
  }
  if (markdown) for (const span of text.matchAll(/`(formancy)\s+[^`\n]+`/g)) found.push(span[1]!)
  return found
}

describe('the packages and commands the documentation names', () => {
  const packages = workspacePackages()
  const bins = new Set([...packages.values()].flatMap(({ bins }) => bins))
  const docs = documents()

  test('are compared with a real workspace and the documents a reader is sent to', () => {
    // A guard on the guard: every assertion below is about absence, so an empty walk, or a
    // manifest reader that saw no bins, would pass for ever.
    expect(packages.size).toBeGreaterThan(15)
    expect(packages.get('@formancy/mcp')?.bins.length).toBeGreaterThan(0)
    const names = docs.map(({ name }) => name)
    for (const page of [
      'README.md',
      'MIGRATIONS.md',
      'apps/docs/src/content/docs/project/roadmap.md',
      'apps/site/src/app.tsx',
      'packages/react/README.md',
      'docs/regulatory/SOUP-DECLARATION.md',
    ]) {
      expect(names, page).toContain(page)
    }
    // And the two exclusions hold: no changelog and no decision record is read.
    const excluded = names.filter((name) => name.endsWith('CHANGELOG.md') || name.startsWith('docs/decisions/'))
    expect(excluded).toEqual([])
  })

  test('are found in every spelling a page uses, which is what lets the cases below fail', () => {
    /*
     * The extractors, held to the spellings they claim. Seven guards here have had their own
     * pattern as the defect — one knew `from '<name>'` and reported a stylesheet's package as
     * imported by nothing. These are the shapes that pattern would have missed.
     */
    expect(
      scopedNames(
        [
          'Plain @formancy/spec. In `@formancy/core`, and `import "@formancy/themes/blueprint.css"`.',
          '[npm](https://www.npmjs.com/package/@formancy/react) and a badge, v/%40formancy%2Fangular?style=flat',
          '```bash\nnpm install @formancy/builder-core@0.4.0\n```',
        ].join('\n'),
      ),
    ).toEqual([
      '@formancy/spec',
      '@formancy/core',
      '@formancy/themes',
      '@formancy/react',
      '@formancy/angular',
      '@formancy/builder-core',
    ])

    expect(
      runs(
        [
          'claude mcp add formancy -- npx -y @formancy/mcp',
          '`npx @formancy/cli types` emits a type',
          "'pnpm dlx @formancy/mcp@0.4.0'",
          'npm exec -- @formancy/mcp',
          'npx --package=@formancy/mcp formancy-mcp --help',
          'bunx -p @formancy/mcp formancy-mcp',
          '"command": "npx",\n  "args": ["-y", "@formancy/mcp"],',
          'an `npx` on its own runs nothing',
        ].join('\n'),
      ),
    ).toEqual([
      { packages: ['@formancy/mcp'] },
      { packages: ['@formancy/cli'] },
      { packages: ['@formancy/mcp'] },
      { packages: ['@formancy/mcp'] },
      { packages: ['@formancy/mcp'], command: 'formancy-mcp' },
      { packages: ['@formancy/mcp'], command: 'formancy-mcp' },
      { packages: ['@formancy/mcp'] },
    ])

    expect(
      installed("npm install @formancy/react @formancy/spec   # React 19\n'pnpm add @formancy/tiptap'\npnpm install --frozen-lockfile"),
    ).toEqual(['@formancy/react', '@formancy/spec', '@formancy/tiptap'])

    expect(
      bareCommands(
        [
          '```bash\n$ formancy migrate ./forms\nFORMANCY_URL=x formancy-mcp\ncd x && formancy types\nclaude mcp add formancy -- npx -y @formancy/mcp\n```',
          'Run `formancy types src/forms`; the part is `formancy-rules-overview`; the file is `formancy.schema.json`.',
          'A theme rule, `formancy-layout { display: contents }`, is CSS.',
        ].join('\n'),
        true,
      ),
    ).toEqual(['formancy', 'formancy-mcp', 'formancy', 'formancy'])
    // And outside Markdown a backtick is a template literal, so only a shell block counts.
    expect(bareCommands('throw new Error(`formancy has no default control for "${type}"`)', false)).toEqual([])
  })

  test('name only packages the workspace has', () => {
    // The defect itself: `@formancy/cli`, named on three pages, in no manifest.
    const missing = docs.flatMap(({ name, text }) =>
      scopedNames(text)
        .filter((reference) => !packages.has(reference))
        .map(
          (reference) =>
            `${name} names ${reference}, and no package in packages/ or apps/ is called that — ` +
            'a reader who installs it gets a 404 from npm',
        ),
    )

    expect([...new Set(missing)]).toEqual([])
  })

  /** What is wrong with one runner line, judged against the manifests; empty when nothing is. */
  const problemsWith = ({ packages: fetched, command }: Run): string[] => {
    const excused = new Set(FETCHED_FROM_ELSEWHERE.map(({ name }) => name))
    const problems: string[] = []
    for (const spec of fetched) {
      if (!spec.startsWith(SCOPE)) {
        if (excused.has(spec)) continue
        const owner = [...packages.values()].find(({ bins }) => bins.includes(spec))
        problems.push(
          owner === undefined
            ? `fetch ${spec}, which is not ours and not named in FETCHED_FROM_ELSEWHERE`
            : `fetch ${spec}, which is a command in ${owner.name} and not a package — ` +
                `npx would ask npm for a package called ${spec}`,
        )
        continue
      }
      const ours = packages.get(spec)
      if (ours === undefined) {
        problems.push(`fetch ${spec}, which is not a package in this workspace`)
        continue
      }
      if (!ours.published) {
        problems.push(`fetch ${spec}, which is private and never published`)
        continue
      }
      // With no command named, npx runs the package's only command, or the one named after
      // it — and refuses when there is neither.
      if (command === undefined && ours.bins.length !== 1 && !ours.bins.includes(spec.slice(SCOPE.length))) {
        const declared = ours.bins.length === 0 ? 'no command' : 'several commands and none named after it'
        problems.push(`fetch ${spec}, which declares ${declared}, so there is nothing for it to run`)
      }
    }
    // A command named with `--package` must be in one of those packages — knowable only
    // when all of them are ours.
    const ours = fetched.flatMap((spec) => packages.get(spec) ?? [])
    const knowable = command !== undefined && ours.length === fetched.length
    if (knowable && !ours.some(({ bins }) => bins.includes(command))) {
      problems.push(`run ${command} from ${fetched.join(', ')}, which declares no such command`)
    }
    return problems
  }

  test('fetch and run only packages that are published and declare the command run', () => {
    // The roadmap's `npx @formancy/cli types`, and the near misses of the line that does
    // work: `npx formancy-mcp` asks npm for somebody else's package, and a package made
    // private or stripped of its `bin` leaves every page's `npx -y @formancy/mcp` dead.
    const wrong = docs.flatMap(({ name, text }) =>
      runs(text).flatMap((run) => problemsWith(run).map((problem) => `${name} tells a runner to ${problem}`)),
    )

    expect([...new Set(wrong)]).toEqual([])
  })

  test('install only packages that are published', () => {
    // `pnpm --filter @formancy/docs test` names a private package and is right to; telling a
    // reader to install one is a 404 just as an absent package is.
    const wrong = docs.flatMap(({ name, text }) =>
      installed(text)
        .filter((spec) => packages.get(spec)?.published !== true)
        .map(
          (spec) =>
            `${name} installs ${spec}, which ` +
            (packages.has(spec) ? 'is private and never published' : 'is not a package in this workspace'),
        ),
    )

    expect([...new Set(wrong)]).toEqual([])
  })

  test('run bare only commands some manifest declares', () => {
    // The same claim with the package left out: `formancy migrate` in a shell block says a
    // command exists just as `npx @formancy/cli migrate` does.
    const wrong = docs.flatMap(({ name, text }) =>
      bareCommands(text, /\.mdx?$/.test(name))
        .filter((command) => !bins.has(command))
        .map((command) => `${name} runs \`${command}\`, and no package declares a command by that name`),
    )

    expect([...new Set(wrong)]).toEqual([])
  })

  test('fetched from elsewhere are still fetched, and each says why', () => {
    // The list cannot rot the other way: an entry nothing uses any more is an exemption
    // waiting for the next stranger's package, so it fails until it is removed.
    const fetched = new Set(docs.flatMap(({ text }) => runs(text).flatMap(({ packages: named }) => named)))
    for (const { name, why } of FETCHED_FROM_ELSEWHERE) {
      expect(fetched.has(name), `${name} is excused and no page fetches it`).toBe(true)
      expect(name.startsWith(SCOPE), `${name} is ours, and ours are checked, not excused`).toBe(false)
      expect(why.length, `${name} is excused without a reason`).toBeGreaterThan(40)
    }
  })
})
