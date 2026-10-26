#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { run } from './cli.js'

/** The `formancy` executable: the command with the real disk and terminal. */
process.exitCode = await run(process.argv.slice(2), {
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: (path, text) => writeFile(path, text, 'utf8'),
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
})
