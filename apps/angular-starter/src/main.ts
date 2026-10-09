import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { StarterApp } from './app/app.js'

/** Zoneless, as every formancy binding is: the engine's snapshots are signals' business. */
bootstrapApplication(StarterApp, { providers: [provideZonelessChangeDetection()] }).catch(
  (error: unknown) => {
    // Shown, not only logged: a starter that fails to start should say so on the page.
    document.body.textContent = `The starter did not start: ${error instanceof Error ? error.message : String(error)}`
  },
)
