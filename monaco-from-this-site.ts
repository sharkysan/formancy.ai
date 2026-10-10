import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

/**
 * The parts of a Vite plugin this one uses, written out rather than imported: this module
 * sits at the repository's root, where `vite` is not installed, and a type import from it
 * failed the playground's typecheck, which reaches this file through `build-base.test.ts`.
 * Structural, so each app's config takes it as the `Plugin` its own Vite expects.
 */
interface MonacoPlugin {
  readonly name: string
  configResolved(config: { readonly root: string; readonly build: { readonly outDir: string } }): void
  configureServer(server: {
    readonly middlewares: {
      use(
        path: string,
        handle: (request: IncomingMessage, response: ServerResponse, next: () => void) => void,
      ): unknown
    }
  }): void
  writeBundle(): void
}

/**
 * Monaco's AMD build, served by the app that shows it (0154).
 *
 * `@monaco-editor/react` loads Monaco at runtime, by script tag, from wherever its
 * loader's `paths.vs` points — jsDelivr unless told otherwise, so every visitor's address
 * went to a CDN. Each app's `main.tsx` points it at `vs` under its own base instead, and
 * this puts the files there: copied
 * whole from the installed `monaco-editor` into the build, and served from the same
 * directory by the development server, so the two cannot differ in what they find.
 *
 * Whole rather than picked: the loader asks for modules by name as the editor needs them,
 * a language or a worker at a time, and a list of the ones we think it needs would be a
 * second copy of Monaco's module graph that nothing checks. The cost is the bytes, which
 * are measured in the decision record.
 *
 * The directory is found from the app's root when Vite resolves its config, never from
 * `import.meta.url`, which is not a file URL under Vitest's transform. One plugin for both
 * apps that show Monaco — the playground and the admin — so where the files are and where
 * the loader looks cannot drift between them; each app keeps the path in a module its
 * `main.tsx` and its config both read.
 */
export function monacoFromThisSite(vs: string): MonacoPlugin {
  let source = ''
  let outDir = ''
  const TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
  }
  return {
    name: 'formancy:monaco-from-this-site',
    configResolved(config) {
      source = join(config.root, 'node_modules', 'monaco-editor', 'min', 'vs')
      outDir = join(config.root, config.build.outDir)
    },
    configureServer(server) {
      // Before Vite's own middleware, which would otherwise transform these as modules.
      server.middlewares.use(`/${vs}`, (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        const file = join(source, normalize(decodeURIComponent(path)))
        if (!file.startsWith(source + sep) || !existsSync(file) || !statSync(file).isFile()) {
          next()
          return
        }
        response.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(response)
      })
    },
    writeBundle() {
      if (!existsSync(join(source, 'loader.js'))) {
        throw new Error(`No Monaco AMD build at ${source}: is monaco-editor installed?`)
      }
      const into = join(outDir, ...vs.split('/'))
      cpSync(source, into, { recursive: true })
      // Its licence and notices travel with it, as they do in the package: this is now
      // a copy we distribute, not one a CDN does.
      for (const notice of ['LICENSE', 'ThirdPartyNotices.txt']) {
        cpSync(join(source, '..', '..', notice), join(into, '..', notice))
      }
    },
  }
}

