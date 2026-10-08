import { Pipe } from '@angular/core'
import type { PipeTransform } from '@angular/core'
import type { BuilderMessageId, BuilderText } from '@formancy/builder-core'

/**
 * A builder message in the session's language, for a template.
 *
 * `{{ 'tree.empty' | builderText: text() }}`. A pure pipe rather than a method
 * the template calls: Angular runs a template's method calls on every change
 * detection pass and memoises a pure pipe on its arguments, so a message is
 * formatted again only when the language or its values change. The language is
 * an argument rather than something the pipe injects, because it belongs to the
 * session a component was given — two builders on one page can speak two
 * languages ([0114](../../../docs/decisions/0114-the-builder-speaks-the-authors-language.md)).
 */
@Pipe({ name: 'builderText' })
export class BuilderTextPipe implements PipeTransform {
  transform(
    id: BuilderMessageId,
    text: BuilderText,
    values?: Readonly<Record<string, string | number>>,
  ): string {
    return text(id, values)
  }
}
