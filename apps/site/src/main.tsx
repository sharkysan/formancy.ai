import { App } from './app.js'
import { mount, replace } from './mount.js'
import { OgCard } from './og-card.js'
import './og-card.css'

const root = document.getElementById('root')
if (root === null) throw new Error('No #root in index.html')

/*
 * `?og` renders the social card instead of the page.
 *
 * The image a chat app or a search result shows has to say what the page says, and the
 * one before this outlived two rewrites of the headline. Built from the same fonts,
 * colours and renderer, it cannot drift without the drift being visible in the source.
 * `docs/images/README.md` says how to turn it into `public/og.png`.
 *
 * Read here, before anything renders, and never during a render: the build renders the
 * page with no address at all (0243), so the page itself must not depend on one. The root
 * holds the page the build wrote, so the card replaces it; otherwise the page takes the
 * markup over.
 */
if (new URLSearchParams(window.location.search).has('og')) replace(root, <OgCard />)
else mount(root, <App />)
