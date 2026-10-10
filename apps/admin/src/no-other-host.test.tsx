import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { loader } from '@monaco-editor/react'
// The shell as Vite serves it, read as text: the admin has no Node types to read it with.
import shell from '../index.html?raw'

/**
 * Every deployment's admin asks no other site for anything.
 *
 * It took its faces from Google Fonts and Monaco from jsDelivr — the two loads
 * formancy.ai's own pages stopped making in 0154 — so each operator who opened it told
 * Google and a CDN their address. The website's request gate never opened the admin,
 * which is a deployment's page and needs a server behind it, so nothing said so.
 */
afterEach(cleanup)

describe('the admin', () => {
  test('names no other host in the page it is served as', () => {
    // A stylesheet, a preconnect or a script on another origin is a request the
    // operator's browser makes before the admin has drawn anything. Every src and href
    // in the shell is read, not a list of the hosts that were there.
    const elsewhere = [...shell.matchAll(/\s(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1]!)
      .filter((address) => /^(?:https?:)?\/\//i.test(address))
    expect(elsewhere).toEqual([])
  })

  test('loads Monaco from its own origin, under its own base', async () => {
    // The loader injects a script tag for `${paths.vs}/loader.js`; left unconfigured,
    // that is cdn.jsdelivr.net. main.tsx configures it before anything asks.
    document.body.innerHTML = '<div id="root"></div>'
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
    await import('./main.js')
    void loader.init().catch(() => undefined)

    const script = document.querySelector<HTMLScriptElement>('script[src$="/loader.js"]')
    expect(script?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}monaco/vs/loader.js`)
    vi.unstubAllGlobals()
  })
})
