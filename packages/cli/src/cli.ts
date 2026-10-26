import { answersTypeScript } from '@formancy/spec'
import { validateSchema } from '@formancy/spec/validate'

/**
 * What the command reads and writes, handed in so a test runs it without a disk or a
 * terminal and `main.ts` hands it the real ones.
 */
export interface CliIo {
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  out(text: string): void
  err(text: string): void
}

const USAGE = `Usage: formancy types <form.json> [--name <TypeName>] [--out <file.ts>]

  types   Print the TypeScript type of what the form's submissions hold.
          --name  what to call the type; by default the form's id, then "Answers"
          --out   write the type to this file instead of printing it
`

/**
 * Runs one command and answers its exit code: 0 done, 1 the form could not be read or is
 * not a form, 2 the command line was not one this understands.
 *
 * **A document is validated before it is printed.** A type printed from a document the
 * engine would refuse to load describes submissions nobody can make, and an error message
 * is the more useful thing to hand back.
 */
export async function run(args: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = args
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    io.out(USAGE)
    return command === undefined ? 2 : 0
  }
  if (command !== 'types') {
    io.err(`formancy: "${command}" is not a command.\n\n${USAGE}`)
    return 2
  }

  const parsed = parse(rest)
  if (typeof parsed === 'string') {
    io.err(`formancy types: ${parsed}\n\n${USAGE}`)
    return 2
  }

  let text: string
  try {
    text = await io.readFile(parsed.file)
  } catch (error) {
    io.err(`formancy types: cannot read ${parsed.file}: ${(error as Error).message}\n`)
    return 1
  }

  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    io.err(`formancy types: ${parsed.file} is not JSON: ${(error as Error).message}\n`)
    return 1
  }

  const validated = validateSchema(document)
  if (!validated.valid) {
    const problems = validated.errors.map((error) => `  ${error.path || '/'}: ${error.message}`).join('\n')
    io.err(`formancy types: ${parsed.file} is not a form this version of formancy reads:\n${problems}\n`)
    return 1
  }

  let printed: string
  try {
    printed = answersTypeScript(validated.schema, parsed.name === undefined ? {} : { name: parsed.name })
  } catch (error) {
    io.err(`formancy types: ${(error as Error).message}\n`)
    return 2
  }

  if (parsed.out === undefined) {
    io.out(printed)
  } else {
    await io.writeFile(parsed.out, printed)
  }
  return 0
}

/** The file and the two options, or what is wrong with them. */
function parse(args: readonly string[]): { file: string; name?: string; out?: string } | string {
  let file: string | undefined
  const options: { name?: string; out?: string } = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--name' || arg === '--out') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value.`
      options[arg === '--name' ? 'name' : 'out'] = value
      index += 1
    } else if (arg.startsWith('--')) {
      return `${arg} is not an option.`
    } else if (file === undefined) {
      file = arg
    } else {
      return `one form at a time: ${file} and ${arg} were both given.`
    }
  }
  return file === undefined ? 'which form? Give the path to its JSON.' : { file, ...options }
}
