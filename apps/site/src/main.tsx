import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.js'
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
 */
const wantsCard = new URLSearchParams(window.location.search).has('og')

createRoot(root).render(<StrictMode>{wantsCard ? <OgCard /> : <App />}</StrictMode>)
