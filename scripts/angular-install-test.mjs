#!/usr/bin/env node
/**
 * Install the packed Angular packages into an Angular project that knows nothing about
 * this repository, build it with that project's Angular, and run it in Chromium.
 *
 * **Why `install-test.mjs` cannot.** Its consumer is a few lines of TypeScript; an
 * Angular package is consumed by an Angular build, whose linker turns ng-packagr's
 * partial declarations into code — and which Angular does that is the consumer's. So
 * whether `@formancy/angular` works with the oldest Angular its peer range admits is a
 * question only an Angular project at that version can answer (0134).
 *
 * `FORMANCY_ANGULAR` chooses the version — CI runs the lowest the peer range admits and
 * the newest; a run on one machine takes the newest. Angular Material follows it, because
 * Angular requires its packages at one version.
 *
 * **What it proves.** The tarballs install; the consumer's linker accepts them; the main
 * entry and `/material` resolve and render in a real browser — Material for the email,
 * the default control for the file — and a submit reaches the engine and back. It does
 * not run the conformance suite under that version: that runs against the workspace's
 * own Angular, and the gap is said in the compatibility page.
 */
import { createServer } from 'node:http'
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pack, publishable, run } from './pack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ANGULAR = process.env.FORMANCY_ANGULAR ?? '^22.1.7'

/** `@formancy/angular` and every workspace package it needs, transitively. */
function closure(all, start) {
  const byName = new Map(all.map((entry) => [entry.name, entry]))
  const needed = new Map()
  const visit = (name) => {
    if (needed.has(name)) return
    const entry = byName.get(name)
    if (entry === undefined) throw new Error(`${name} is not a publishable package`)
    needed.set(name, entry)
    const manifest = JSON.parse(readFileSync(join(entry.dir, 'package.json'), 'utf8'))
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (String(range).startsWith('workspace:')) visit(dependency)
    }
  }
  visit(start)
  return [...needed.values()]
}

/** The built page over HTTP, on a port the system picks. */
function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
  const server = createServer((request, response) => {
    const path = normalize(
      join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname)),
    )
    const file = existsSync(path) && statSync(path).isFile() ? path : join(root, 'index.html')
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(server)))
}

// The real path, not the one tmpdir() gives: on Windows that can be an 8.3 short name
// (DBACH~1.BLA), Vite resolves modules to the long one, and Analog's plugin then found no
// file of the project's own in its program and compiled none of them — measured.
const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'formancy-angular-install-')))
let failed = false
let server

try {
  const packages = closure(publishable(), '@formancy/angular')
  const tarballs = pack(packages, work)
  console.log(`packed ${[...tarballs.keys()].join(', ')}`)

  const project = join(work, 'consumer')
  mkdirSync(project, { recursive: true })
  cpSync(join(here, 'angular-install-fixture'), project, { recursive: true })
  writeFileSync(
    join(project, 'package.json'),
    `${JSON.stringify(
      {
        name: 'formancy-angular-install-test',
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries([...tarballs].map(([name, file]) => [name, `file:${file}`])),
          // One version for every Angular package, Material included: Angular refuses
          // siblings at different versions.
          '@angular/cdk': ANGULAR,
          '@angular/common': ANGULAR,
          '@angular/compiler': ANGULAR,
          '@angular/core': ANGULAR,
          '@angular/forms': ANGULAR,
          '@angular/material': ANGULAR,
          '@angular/platform-browser': ANGULAR,
          rxjs: '^7.8.1',
          tslib: '^2.8.0',
        },
        devDependencies: {
          '@analogjs/vite-plugin-angular': '^2.7.2',
          '@angular/build': ANGULAR,
          '@angular/compiler-cli': ANGULAR,
          typescript: '~6.0.3',
          vite: '^8.3.0',
        },
      },
      null,
      2,
    )}\n`,
  )

  console.log(`installing them into an Angular ${ANGULAR} project…`)
  // npm, not pnpm: pnpm under a workspace can still find the workspace.
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], project)
  const installed = JSON.parse(
    readFileSync(join(project, 'node_modules', '@angular', 'core', 'package.json'), 'utf8'),
  ).version
  console.log(`building it with Angular ${installed}…`)
  run('npx', ['vite', 'build'], project)

  console.log('running it in Chromium…')
  const { chromium } = await import('playwright')
  server = await serve(join(project, 'dist'))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(`http://127.0.0.1:${String(server.address().port)}/`)
    const email = page.getByLabel('Email')
    try {
      await email.waitFor({ timeout: 30_000 })
    } catch {
      // Nothing rendered: say why, rather than only that the label never appeared.
      const failedToStart = await page.locator('body').getAttribute('data-failed')
      throw new Error(
        ['the form never rendered', failedToStart ?? '', ...errors]
          .filter((line) => line !== '')
          .join('\n'),
      )
    }
    const inMaterial = await email.evaluate((input) => input.closest('mat-form-field') !== null)
    const fileByDefault = await page
      .getByLabel('Receipt')
      .evaluate(
        (input) =>
          input.getAttribute('type') === 'file' && input.closest('mat-form-field') === null,
      )
    await email.fill('ada@example.org')
    await page.getByRole('button', { name: 'Submit' }).click()
    const outcome = await page.locator('#outcome').textContent({ timeout: 10_000 })
    const problems = [
      ...(inMaterial ? [] : ['the email is not drawn by Material']),
      ...(fileByDefault ? [] : ['the file is not drawn by the default control']),
      ...(outcome?.includes('ada@example.org')
        ? []
        : [`the submit did not come back: ${String(outcome)}`]),
      ...errors.map((message) => `page error: ${message}`),
    ]
    if (problems.length > 0) throw new Error(problems.join('\n'))
  } finally {
    await browser.close()
  }

  console.log(
    `\nAngular install test passed: the packed Angular packages run under Angular ${installed}`,
  )
} catch (error) {
  failed = true
  console.error('\nAngular install test FAILED')
  console.error(error.message)
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`
  if (detail.trim() !== '') console.error(detail.slice(0, 6000))
} finally {
  server?.close()
  // FORMANCY_KEEP leaves the project behind, to look at a failure rather than guess.
  if (process.env.FORMANCY_KEEP === undefined) rmSync(work, { recursive: true, force: true })
  else console.error('kept: ' + work)
}

process.exit(failed ? 1 : 0)
