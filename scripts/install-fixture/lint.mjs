/**
 * `@formancy/code-style` as a repository uses it: imported by name from its tarball, with
 * its dependencies and its peers installed beside it by npm, its ESLint configuration made
 * for this project and run over a file here, and its Prettier options handed to Prettier.
 *
 * JavaScript run by Node, as a repository's `eslint.config.mjs` is loaded: the package
 * ships no types, so the type-check of this project has nothing of it to read.
 *
 * `floating.ts` is what proves the configuration whole. Its floating promise is reported
 * by a type-aware rule alone, so only after every plugin the configuration names has
 * loaded and typescript-eslint has built this project's program. A message ESLint marks
 * fatal, a file it could not parse or one no tsconfig holds, fails it whatever else is
 * reported.
 */
import { ESLint } from 'eslint'
import * as prettier from 'prettier'
import { eslintConfig, prettierConfig } from '@formancy/code-style'

const root = import.meta.dirname

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: eslintConfig({ root, project: ['./tsconfig.json'], ignoreFiles: ['.gitignore'], tests: ['**/*.test.ts'] }),
})
const [result] = await eslint.lintFiles(['floating.ts'])
const fatal = result.messages.filter((message) => message.fatal)
if (fatal.length > 0) throw new Error(`floating.ts was not linted: ${fatal.map((message) => message.message).join('; ')}`)
const rules = result.messages.map((message) => message.ruleId)
if (!rules.includes('@typescript-eslint/no-floating-promises')) {
  throw new Error(`the type-aware rules did not run: floating.ts was reported for ${JSON.stringify(rules)}`)
}

// The shared style, where Prettier's default would keep the double quotes and the semicolon.
const formatted = await prettier.format('const a = "x";\n', { ...prettierConfig, parser: 'typescript' })
if (formatted !== "const a = 'x'\n") throw new Error(`Prettier did not format with the shared options: ${JSON.stringify(formatted)}`)

console.log(`floating.ts linted with the installed @formancy/code-style: ${rules.join(', ')}`)
