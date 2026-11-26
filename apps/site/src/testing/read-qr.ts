/**
 * A QR code's text read back from its modules (ISO/IEC 18004), for the tests that hold the
 * Swiss QR Code the site draws (0244) to what it says, and not only to the encoder that drew
 * it: a reader written here, so that a fault in the encoding is found by something that does
 * not share its code.
 *
 * It reads what a camera's reader has once it has found a code and sampled it, and nothing
 * harder: the symbol's modules exactly, without a quiet zone, rows of `true` for dark. The
 * format information names the level and the mask, and is read only where both of its copies
 * agree and its BCH code checks. The codewords that correct errors are set aside and not
 * checked, because a clean symbol needs none corrected. It reads level M, the level SIX
 * requires (IG 6.1), up to version 25, the largest SIX allows (6.2), and byte mode, which is
 * how a payload with lower-case letters in it is encoded; anything else is refused rather
 * than read wrong.
 */

/** What a code says, and how it said it. */
export interface QrReading {
  readonly version: number
  readonly level: 'L' | 'M' | 'Q' | 'H'
  readonly mask: number
  readonly text: string
}

/** The level each format information's two bits name. */
const LEVELS = ['M', 'L', 'H', 'Q'] as const

/**
 * At level M, by version from 1 to 25: the error correction codewords in each block, and the
 * blocks (ISO/IEC 18004, Table 9). Checked against uqr 0.1.3's tables on 2026-11-26.
 */
const LEVEL_M: readonly (readonly [perBlock: number, blocks: number])[] = [
  [10, 1],
  [16, 1],
  [26, 1],
  [18, 2],
  [24, 2],
  [16, 4],
  [18, 4],
  [22, 4],
  [22, 5],
  [26, 5],
  [30, 5],
  [22, 8],
  [22, 9],
  [24, 9],
  [24, 10],
  [28, 10],
  [28, 11],
  [26, 13],
  [26, 14],
  [26, 16],
  [26, 17],
  [28, 17],
  [28, 18],
  [28, 20],
  [28, 21],
]

/** The eight masks, each whether the module at column `x` and row `y` is flipped. */
const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** The centres of a version's alignment patterns, on each axis. */
function alignmentCentres(version: number, size: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const centres = [6]
  for (let at = size - 7; centres.length < count; at -= step) centres.splice(1, 0, at)
  return centres
}

/** Which modules are the symbol's own patterns and information, and hold no data: finders with their separators and the format information, timing, alignment, version information. */
function functionModules(version: number, size: number): boolean[][] {
  const marked = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const mark = (left: number, top: number, width: number, height: number): void => {
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) marked[y]![x] = true
  }
  mark(0, 0, 9, 9)
  mark(size - 8, 0, 8, 9)
  mark(0, size - 8, 9, 8)
  mark(6, 0, 1, size)
  mark(0, 6, size, 1)
  const centres = alignmentCentres(version, size)
  const last = size - 7
  for (const y of centres) {
    for (const x of centres) {
      if ((x === 6 && (y === 6 || y === last)) || (x === last && y === 6)) continue
      mark(x - 2, y - 2, 5, 5)
    }
  }
  if (version >= 7) {
    mark(size - 11, 0, 3, 6)
    mark(0, size - 11, 6, 3)
  }
  return marked
}

/** The format information's fifteen bits, its first copy around the top-left finder and its second split between the other two. */
function formatInformation(dark: (x: number, y: number) => boolean, size: number): number {
  const first: boolean[] = []
  for (let i = 0; i <= 5; i++) first.push(dark(8, i))
  first.push(dark(8, 7), dark(8, 8), dark(7, 8))
  for (let i = 9; i < 15; i++) first.push(dark(14 - i, 8))
  const second: boolean[] = []
  for (let i = 0; i < 8; i++) second.push(dark(size - 1 - i, 8))
  for (let i = 8; i < 15; i++) second.push(dark(8, size - 15 + i))
  const value = (bits: boolean[]): number => bits.reduce((sum, bit, i) => sum | (Number(bit) << i), 0)
  if (value(first) !== value(second)) throw new Error('the two copies of the format information differ')
  const bits = value(first)
  const data = (bits ^ 0x5412) >>> 10
  let remainder = data
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
  if ((((data << 10) | remainder) ^ 0x5412) !== bits) throw new Error('the format information fails its BCH code')
  return data
}

/** The text `modules` hold: version, level, mask and the UTF-8 of their byte-mode segments. */
export function readQr(modules: readonly (readonly boolean[])[]): QrReading {
  const size = modules.length
  const version = (size - 17) / 4
  if (!Number.isInteger(version) || version < 1 || modules.some((row) => row.length !== size))
    throw new Error(`${String(size)} rows of modules are no QR code's`)
  const dark = (x: number, y: number): boolean => modules[y]?.[x] === true

  const format = formatInformation(dark, size)
  const level = LEVELS[format >>> 3]!
  const mask = format & 7
  const blocks = LEVEL_M[version - 1]
  if (level !== 'M' || blocks === undefined) throw new Error(`a version ${String(version)} code at level ${level}: this reads level M up to version 25`)

  // The data modules, unmasked, two columns at a time from the right, up and down in turn.
  const functions = functionModules(version, size)
  const flipped = MASKS[mask]!
  const bits: number[] = []
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    const upward = ((right + 1) & 2) === 0
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step
      for (const x of [right, right - 1]) if (!functions[y]![x]) bits.push(Number(dark(x, y) !== flipped(x, y)))
    }
  }
  const codewords: number[] = []
  for (let at = 0; at + 8 <= bits.length; at += 8) codewords.push(bits.slice(at, at + 8).reduce((byte, bit) => (byte << 1) | bit, 0))

  // The blocks were interleaved a codeword of each at a time, the short blocks a data
  // codeword fewer; each block's data comes before its error correction.
  const [perBlock, count] = blocks
  const short = count - (codewords.length % count)
  const shortLength = Math.floor(codewords.length / count)
  const interleaved = Array.from({ length: count }, () => Array<number>(shortLength + 1).fill(0))
  let next = 0
  for (let i = 0; i <= shortLength; i++) {
    for (let block = 0; block < count; block++) {
      if (i === shortLength - perBlock && block < short) continue
      interleaved[block]![i] = codewords[next++]!
    }
  }
  if (next !== codewords.length) throw new Error('the codewords do not fill the blocks')
  const data = interleaved.flatMap((block, index) => block.slice(0, shortLength - perBlock + (index < short ? 0 : 1)))

  let position = 0
  const read = (width: number): number => {
    let value = 0
    for (let i = 0; i < width; i++, position++) value = (value << 1) | ((data[position >>> 3]! >>> (7 - (position & 7))) & 1)
    return value
  }
  const bytes: number[] = []
  while (position + 4 <= data.length * 8) {
    const mode = read(4)
    if (mode === 0) break
    if (mode !== 0b0100) throw new Error(`a segment in mode ${mode.toString(2).padStart(4, '0')}: this reads byte mode`)
    const length = read(version <= 9 ? 8 : 16)
    for (let i = 0; i < length; i++) bytes.push(read(8))
  }
  return { version, level, mask, text: new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)) }
}

/**
 * The modules a path of runs draws, as `swiss-qr-code.tsx` writes one: a rectangle a module
 * high for each run, `M<x> <y>h<length>v1h-<length>z`. Anything else in the path is refused,
 * so a drawing written another way is not read as an empty square.
 */
export function modulesOfRuns(path: string, size: number): boolean[][] {
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const run = /M(\d+) (\d+)h(\d+)v1h-\3z/gy
  let match: RegExpExecArray | null
  let end = 0
  while ((match = run.exec(path)) !== null) {
    const [x, y, length] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (y >= size || x + length > size) throw new Error(`a run past the square at ${String(x)} ${String(y)}`)
    for (let at = x; at < x + length; at++) modules[y]![at] = true
    end = run.lastIndex
  }
  if (end !== path.length) throw new Error(`the path is not runs from ${String(end)}: ${path.slice(end, end + 24)}`)
  return modules
}
