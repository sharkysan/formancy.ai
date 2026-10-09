import { crc32, deflateSync } from 'node:zlib'

/**
 * A PNG made here rather than read from a fixture: opaque red, of a known size, so the
 * thumbnail's shape and colour are both known. Built from its chunks, because a binary
 * fixture is one more file nobody can read in a diff.
 */
function redPng(width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 2 // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)])
  for (let x = 0; x < width; x += 1) row[1 + x * 3] = 255
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * A picked image, drawn as its thumbnail (0130).
 *
 * jsdom decodes no image and draws on no canvas, so the renderer tests stand both in and
 * can only say the right calls were made. Here Chromium decodes the bytes and draws them,
 * and the theme sizes the result: the centre pixel must be the image's red, the canvas
 * the image's own shape, and what is shown no larger than the theme's 2rem.
 */
export async function checkUploadThumbnails(browser, url, check) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    console.log('\na picked image, drawn — 1180×820')

    for (const renderer of ['React', 'Angular']) {
      const region = page.getByRole('region', { name: renderer, exact: true })
      // The artwork field is shown once gift wrapping is chosen: a rule in the starter.
      await region.getByRole('checkbox', { name: 'Gift wrapping' }).check()
      await region
        .getByLabel('Artwork for the gift wrap')
        .setInputFiles({ name: 'swatch.png', mimeType: 'image/png', buffer: redPng(40, 20) })

      const thumbnail = region.locator('[data-formancy-part="file-thumbnail"]')
      await thumbnail.waitFor({ timeout: 10_000 })
      await thumbnail.evaluate(
        (canvas) =>
          new Promise((done) => {
            const started = Date.now()
            const wait = () =>
              canvas.width > 0 || Date.now() - started > 5000 ? done() : requestAnimationFrame(wait)
            wait()
          }),
      )
      const seen = await thumbnail.evaluate((canvas) => {
        const box = canvas.getBoundingClientRect()
        const centre = canvas
          .getContext('2d')
          .getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
        return {
          drawn: [canvas.width, canvas.height],
          shown: [box.width, box.height],
          pixel: [...centre],
        }
      })

      check(
        `${renderer}: a picked image is drawn from its own bytes`,
        seen.pixel[3] === 255 && seen.pixel[0] > 200 && seen.pixel[1] < 50 && seen.pixel[2] < 50
          ? null
          : `the centre pixel is rgba(${seen.pixel.join(', ')})`,
      )
      check(
        `${renderer}: at the image's own shape, and shown no larger than the theme allows`,
        seen.drawn[0] === 40 &&
          seen.drawn[1] === 20 &&
          seen.shown[0] > 0 &&
          seen.shown[0] <= 32 &&
          Math.abs(seen.shown[0] - 2 * seen.shown[1]) <= 1
          ? null
          : `drawn ${seen.drawn.join('×')}, shown ${seen.shown.join('×')}`,
      )
    }
  } finally {
    await page.close()
  }
}
