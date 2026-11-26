import type { ReactElement } from 'react'
import { encode } from 'uqr'

/**
 * A QR-bill's Swiss QR Code, drawn as Formancy Report's renderer draws one (0244): the same
 * symbol, encoded by the same encoder at the same version with the same options, and the same
 * picture of it, its dark modules one path over white and SIX's cross over its centre.
 *
 * Read from formancy.ai-report's `main` (81405cb) on 2026-11-26: `swissSymbol` in
 * `packages/report-runtime/src/qr-symbol.ts`, which encodes a payload with uqr 0.1.3, pinned
 * exactly in `packages/report-runtime/package.json` and here; and `swissCodeContent` and
 * `darkRuns` in `packages/report-render-pdf/src/qr.ts`, which draw it. "IG" is SIX's Swiss
 * Implementation Guidelines for the QR-bill.
 *
 * The square is the code alone, without a quiet zone: the slip leaves white around it (IG
 * 3.5.2), and here the stylesheet does. Its black and white are SIX's, written on the shapes as
 * Report writes them, and not the paper's ink, so the code is read as the printed one is.
 * Decoration to assistive technology: a picture of a code says nothing to a screen reader, and
 * what it carries is printed beside it, as a slip prints it.
 */

/**
 * The symbol of `payload` as Report's `swissSymbol` encodes it: its UTF-8 at level M (IG 6.1),
 * in the smallest version that holds it (6.4) and never past version 25 (6.2), the level never
 * raised to fill a version, and no quiet zone. Rows of modules, `true` for dark.
 */
function swissModules(payload: string): boolean[][] {
  return encode(payload, { ecc: 'M', border: 0, boostEcc: false, maxVersion: 25 }).data
}

/** The dark modules as one path's subpaths, a rectangle for each run of them in a row: Report's `darkRuns`, at no offset. */
function darkRuns(modules: readonly (readonly boolean[])[]): string {
  const runs: string[] = []
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      const start = x
      while (row[x + 1] === true) x++
      const length = x + 1 - start
      runs.push(`M${String(start)} ${String(y)}h${String(length)}v1h-${String(length)}z`)
    }
  })
  return runs.join('')
}

/**
 * The Swiss cross over the code's centre (IG 6.4.2), in millimetres of the code's 46: a white
 * square of 7, a black square of 6 on it, and a white cross on that, its arms 7/6 wide and 35/9
 * from end to end. Report's `SWISS_CROSS`.
 */
const CROSS = { white: 7, black: 6, arm: 7 / 6, span: 35 / 9 } as const

/** The code's side in millimetres, whatever its version (IG 6.4): its modules are this over theirs. */
const SIDE = 46

export function SwissQrCode({ payload }: { payload: string }): ReactElement {
  const modules = swissModules(payload)
  const across = modules.length
  const unit = across / SIDE
  const centre = across / 2
  const square = (side: number, fill: string): ReactElement => (
    <rect x={centre - (side * unit) / 2} y={centre - (side * unit) / 2} width={side * unit} height={side * unit} fill={fill} />
  )
  const [arm, span] = [(CROSS.arm * unit) / 2, (CROSS.span * unit) / 2]
  const corners: readonly (readonly [number, number])[] = [
    [-arm, -span],
    [arm, -span],
    [arm, -arm],
    [span, -arm],
    [span, arm],
    [arm, arm],
    [arm, span],
    [-arm, span],
    [-arm, arm],
    [-span, arm],
    [-span, -arm],
    [-arm, -arm],
  ]
  const cross = `M${corners.map(([x, y]) => `${String(centre + x)} ${String(centre + y)}`).join('L')}z`

  return (
    <svg className="mx-qr" viewBox={`0 0 ${String(across)} ${String(across)}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect width={across} height={across} fill="#fff" />
      <path className="mx-qr-modules" d={darkRuns(modules)} fill="#000" />
      {square(CROSS.white, '#fff')}
      {square(CROSS.black, '#000')}
      <path className="mx-qr-cross" d={cross} fill="#fff" />
    </svg>
  )
}
