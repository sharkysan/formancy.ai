import { describe, expect, test } from 'vitest'
import type { FieldBinding } from './field.js'
import type { UploadOptions } from './uploads.js'

/**
 * The functions of an interface a host implements, or is handed and passes on, are methods
 * whose `this` is `void`. A method keeps the check a host's implementation was always held
 * to, its parameters compared both ways under `strict`; a function-typed property, which the
 * lint fixes first made them, compares them one way, and refused an implementation with a
 * narrower parameter that had compiled (TS2322). `this: void` says the function needs no
 * `this`, so it may be passed on detached, as `@typescript-eslint/unbound-method` reads it.
 *
 * What fails is `pnpm typecheck`, which reads this file; the calls say each runs detached.
 */
describe("a field binding and an uploader's options, as a host writes them", () => {
  test('take an implementation whose parameter is narrower, as a method allows', () => {
    const said: string[] = []
    const binding: Pick<FieldBinding, 'setValue' | 'touch'> = {
      setValue: (value: string) => void said.push(value),
      touch: () => void said.push('touched'),
    }
    const options: Pick<UploadOptions, 'onProgress'> = { onProgress: (sent: 0 | 1, total: number) => void said.push(`${sent} of ${total}`) }
    const { setValue, touch } = binding
    const { onProgress } = options
    setValue('Ada')
    touch()
    onProgress(1, 1)
    expect(said).toEqual(['Ada', 'touched', '1 of 1'])
  })

  test('take a class that implements them', () => {
    class Binding implements Pick<FieldBinding, 'setValue' | 'touch'>, Pick<UploadOptions, 'onProgress'> {
      readonly said: unknown[] = []
      setValue(value: unknown): void {
        this.said.push(value)
      }
      touch(): void {
        this.said.push('touched')
      }
      onProgress(sent: number, total: number): void {
        this.said.push(sent / total)
      }
    }
    const binding = new Binding()
    binding.setValue('Ada')
    binding.touch()
    binding.onProgress(1, 2)
    expect(binding.said).toEqual(['Ada', 'touched', 0.5])
  })
})
