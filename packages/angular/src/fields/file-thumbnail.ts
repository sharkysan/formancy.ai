import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  viewChild,
} from '@angular/core'
import type { ElementRef } from '@angular/core'
import { thumbnailSize } from '@formancy/core'

/**
 * A picture of an image picked in this session, drawn from its bytes.
 *
 * **On a canvas, not an `<img>` on an object URL** — the React binding's reason: a URL
 * is subject to the page's `img-src`, and a strict policy without `blob:` shows a broken
 * image, while this product says a form runs under a strict CSP with no configuration.
 * Decoding with `createImageBitmap` and drawing the bitmap involves no URL at all.
 *
 * At `@formancy/core`'s size, so a picture is the same shape in either renderer. Only
 * for a file picked here: one stored before this page has no bytes in the browser.
 * Decorative — the name beside it is what is read out
 * ([0130](../../../../docs/decisions/0130-each-file-is-its-own-upload.md)).
 */
@Component({
  selector: 'formancy-file-thumbnail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (drawable()) {
      <canvas
        #canvas
        data-formancy-part="file-thumbnail"
        aria-hidden="true"
        width="0"
        height="0"
      ></canvas>
    }
  `,
})
export class FormancyFileThumbnail {
  readonly source = input<File | undefined>(undefined)

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas')

  protected readonly drawable = computed(() => {
    const source = this.source()
    return (
      source !== undefined &&
      source.type.startsWith('image/') &&
      typeof createImageBitmap === 'function'
    )
  })

  constructor() {
    effect((onCleanup) => {
      const source = this.source()
      const target = this.canvas()?.nativeElement
      if (!this.drawable() || source === undefined || target === undefined) return
      let current = true
      onCleanup(() => {
        current = false
      })
      createImageBitmap(source).then(
        (bitmap) => {
          if (current) {
            const { width, height } = thumbnailSize(bitmap.width, bitmap.height)
            target.width = width
            target.height = height
            target.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
          }
          bitmap.close()
        },
        // An image the browser cannot decode gets no picture; its name is still there.
        () => undefined,
      )
    })
  }
}
