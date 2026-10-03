/**
 * The Angular half of this app needs a test environment, exactly as
 * `packages/angular` does.
 *
 * `@angular/compiler` first: the playground renders Angular components whose
 * definitions are produced by the plugin at build time, but Angular's own
 * injectables — `PlatformLocation` among them — are still compiled just in
 * time, and without this the suite fails with *"needs to be compiled using the
 * JIT compiler, but '@angular/compiler' is not available"* on every file that
 * mounts the app.
 */
import '@angular/compiler'
import { getTestBed } from '@angular/core/testing'
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing'

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting())
